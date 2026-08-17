import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { DatabaseService } from "../database/database.service.js";
import { resolveMembershipEffectiveStatus } from "../membership/membership-status.js";
import { MATCH_ROOM_CAPACITY, type MatchRoomSnapshot, type MatchRoomStatus } from "./match-room.contract.js";
import { MatchRoomError, type MatchRoomErrorCode } from "./match-room.error.js";

interface EligibilityRow extends RowDataPacket {
  account_status: string;
  has_steam: number;
  membership_status: string | null;
  membership_expires_at: Date | string | null;
  now_utc: Date | string;
}
interface RoomRow extends RowDataPacket {
  id: string;
  creator_player_account_id: string;
  status: MatchRoomStatus;
  version: string | number;
}
interface ParticipantRow extends RowDataPacket {
  player_account_id: string;
  joined_at: Date | string;
}
interface CountRow extends RowDataPacket { participant_count: string | number }
interface ExistsRow extends RowDataPacket { exists_flag: number }

function isActivePlayerUniqueViolation(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "ER_DUP_ENTRY"
  ) {
    return false;
  }

  const mysqlError = error as {
    sqlMessage?: unknown;
    message?: unknown;
  };
  const message = typeof mysqlError.sqlMessage === "string"
    ? mysqlError.sqlMessage
    : typeof mysqlError.message === "string"
      ? mysqlError.message
      : "";

  return /for key ['`](?:[^'`]*\.)?uniq_match_room_active_player['`]/i.test(message);
}

@Injectable()
export class MatchRoomRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private async inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.beginTransaction();
      try {
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    } finally {
      connection.release();
    }
  }

  private async inReadSnapshot<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.query("SET TRANSACTION READ ONLY");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
      try {
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    } finally {
      connection.release();
    }
  }

  private eligibilityError(row: EligibilityRow): MatchRoomErrorCode | null {
    if (row.account_status === "disabled") return "player_account_disabled";
    if (row.account_status !== "active") throw new TypeError("Invalid player account status.");
    if (!row.has_steam) return "steam_identity_not_linked";
    if (row.membership_status === null) return "membership_required";
    const status = resolveMembershipEffectiveStatus({
      status: row.membership_status, expiresAt: row.membership_expires_at, now: row.now_utc,
    });
    return status === "active" ? null : `membership_${status}` as MatchRoomErrorCode;
  }

  private async getEligibilityError(
    connection: PoolConnection,
    playerAccountId: string,
  ): Promise<MatchRoomErrorCode | null> {
    const [rows] = await connection.execute<EligibilityRow[]>(`
      SELECT a.status AS account_status,
        EXISTS(SELECT 1 FROM player_steam_identities s WHERE s.player_account_id = a.id) AS has_steam,
        m.status AS membership_status, m.expires_at AS membership_expires_at,
        UTC_TIMESTAMP() AS now_utc
      FROM player_accounts a
      LEFT JOIN player_memberships m ON m.player_account_id = a.id
      WHERE a.id = ? LIMIT 1
    `, [playerAccountId]);
    const row = rows[0];
    if (!row) throw new TypeError("Authenticated player account does not exist.");
    return this.eligibilityError(row);
  }

  private async assertEligible(connection: PoolConnection, playerAccountId: string): Promise<void> {
    const error = await this.getEligibilityError(connection, playerAccountId);
    if (error) throw new MatchRoomError(error);
  }

  private async lockRoom(connection: PoolConnection, roomId: string): Promise<RoomRow> {
    const [rows] = await connection.execute<RoomRow[]>(`
      SELECT id, creator_player_account_id, status, version
      FROM match_rooms WHERE id = ? LIMIT 1 FOR UPDATE
    `, [roomId]);
    if (!rows[0]) throw new MatchRoomError("room_not_found");
    return rows[0];
  }

  async create(playerAccountId: string): Promise<string> {
    return this.inTransaction(async (connection) => {
      await this.assertEligible(connection, playerAccountId);
      const roomId = randomUUID();
      try {
        await connection.execute(
          "INSERT INTO match_rooms (id, creator_player_account_id, status, version) VALUES (?, ?, 'FORMING', 1)",
          [roomId, playerAccountId],
        );
        await connection.execute(
          "INSERT INTO match_room_participants (id, room_id, player_account_id) VALUES (?, ?, ?)",
          [randomUUID(), roomId, playerAccountId],
        );
      } catch (error) {
        if (isActivePlayerUniqueViolation(error)) throw new MatchRoomError("already_in_active_room");
        throw error;
      }
      return roomId;
    });
  }

  async join(roomId: string, playerAccountId: string): Promise<void> {
    await this.inTransaction(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (room.status !== "FORMING") throw new MatchRoomError("room_not_joinable");
      await this.assertEligible(connection, playerAccountId);
      const [sameRoom] = await connection.execute<CountRow[]>(`
        SELECT COUNT(*) AS participant_count FROM match_room_participants
        WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL
      `, [roomId, playerAccountId]);
      if (Number(sameRoom[0]?.participant_count ?? 0) > 0) throw new MatchRoomError("already_in_room");
      const [counts] = await connection.execute<CountRow[]>(`
        SELECT COUNT(*) AS participant_count FROM match_room_participants
        WHERE room_id = ? AND released_at IS NULL
      `, [roomId]);
      if (Number(counts[0]?.participant_count ?? 0) >= MATCH_ROOM_CAPACITY) throw new MatchRoomError("room_full");
      try {
        await connection.execute(
          "INSERT INTO match_room_participants (id, room_id, player_account_id) VALUES (?, ?, ?)",
          [randomUUID(), roomId, playerAccountId],
        );
      } catch (error) {
        if (isActivePlayerUniqueViolation(error)) throw new MatchRoomError("already_in_active_room");
        throw error;
      }
      await connection.execute(
        "UPDATE match_rooms SET version = version + 1 WHERE id = ?",
        [roomId],
      );
    });
  }

  async leave(roomId: string, playerAccountId: string): Promise<void> {
    await this.inTransaction(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (room.status !== "FORMING") throw new MatchRoomError("room_not_joinable");
      if (room.creator_player_account_id === playerAccountId) throw new MatchRoomError("creator_must_cancel_room");
      const [result] = await connection.execute<import("mysql2/promise").ResultSetHeader>(`
        UPDATE match_room_participants SET released_at = CURRENT_TIMESTAMP(6), release_reason = 'LEFT'
        WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL
      `, [roomId, playerAccountId]);
      if (result.affectedRows !== 1) throw new MatchRoomError("not_room_participant");
      await connection.execute(
        "UPDATE match_rooms SET version = version + 1 WHERE id = ?",
        [roomId],
      );
    });
  }

  async cancel(roomId: string, playerAccountId: string): Promise<void> {
    await this.inTransaction(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (room.creator_player_account_id !== playerAccountId) throw new MatchRoomError("not_room_creator");
      if (room.status !== "FORMING") throw new MatchRoomError("room_not_cancellable");
      await connection.execute(`
        UPDATE match_rooms SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP(6), version = version + 1
        WHERE id = ?
      `, [roomId]);
      await connection.execute(`
        UPDATE match_room_participants SET released_at = CURRENT_TIMESTAMP(6), release_reason = 'ROOM_CANCELLED'
        WHERE room_id = ? AND released_at IS NULL
      `, [roomId]);
    });
  }

  async getById(roomId: string, viewerId: string): Promise<MatchRoomSnapshot | null> {
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`
        SELECT id, creator_player_account_id, status, version FROM match_rooms WHERE id = ? LIMIT 1
      `, [roomId]);
      if (!rooms[0]) return null;
      const context = await this.readViewerContext(connection, viewerId);
      return this.buildSnapshot(connection, rooms[0], viewerId, context);
    });
  }

  async getCurrent(viewerId: string): Promise<MatchRoomSnapshot | null> {
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`
        SELECT r.id, r.creator_player_account_id, r.status, r.version
        FROM match_room_participants p JOIN match_rooms r ON r.id = p.room_id
        WHERE p.player_account_id = ? AND p.released_at IS NULL LIMIT 1
      `, [viewerId]);
      if (!rooms[0]) return null;
      const context = await this.readViewerContext(connection, viewerId);
      return this.buildSnapshot(connection, rooms[0], viewerId, context);
    });
  }

  async listRelevant(viewerId: string): Promise<MatchRoomSnapshot[]> {
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`
        SELECT DISTINCT r.id, r.creator_player_account_id, r.status, r.version
        FROM match_rooms r LEFT JOIN match_room_participants p
          ON p.room_id = r.id AND p.player_account_id = ? AND p.released_at IS NULL
        WHERE r.status = 'FORMING' OR p.id IS NOT NULL
        ORDER BY r.created_at ASC, r.id ASC
      `, [viewerId]);
      const context = await this.readViewerContext(connection, viewerId);
      return Promise.all(rooms.map((room) =>
        this.buildSnapshot(connection, room, viewerId, context)));
    });
  }

  private async readViewerContext(connection: PoolConnection, viewerId: string): Promise<{
    eligible: boolean;
    hasActiveRoom: boolean;
  }> {
    const eligibilityError = await this.getEligibilityError(connection, viewerId);
    const [activeRows] = await connection.execute<ExistsRow[]>(`
      SELECT EXISTS(
        SELECT 1 FROM match_room_participants
        WHERE player_account_id = ? AND released_at IS NULL
      ) AS exists_flag
    `, [viewerId]);
    return {
      eligible: eligibilityError === null,
      hasActiveRoom: Boolean(activeRows[0]?.exists_flag),
    };
  }

  private async buildSnapshot(
    connection: PoolConnection,
    room: RoomRow,
    viewerId: string,
    context: { eligible: boolean; hasActiveRoom: boolean },
  ): Promise<MatchRoomSnapshot> {
    const [participants] = await connection.execute<ParticipantRow[]>(`
      SELECT player_account_id, joined_at FROM match_room_participants
      WHERE room_id = ? AND released_at IS NULL ORDER BY joined_at ASC, id ASC
    `, [room.id]);
    const viewerParticipant = participants.some((p) => p.player_account_id === viewerId);
    const viewerCreator = room.creator_player_account_id === viewerId;
    const forming = room.status === "FORMING";
    return {
      room: {
        id: room.id, status: room.status, version: Number(room.version),
        creator: { playerAccountId: room.creator_player_account_id },
        participantCount: participants.length, capacity: MATCH_ROOM_CAPACITY,
        participants: participants.map((p) => ({ playerAccountId: p.player_account_id, joinedAt: p.joined_at })),
      },
      viewer: {
        participant: viewerParticipant, creator: viewerCreator,
        actions: {
          canJoin: forming && context.eligible && !context.hasActiveRoom &&
            participants.length < MATCH_ROOM_CAPACITY,
          canLeave: forming && viewerParticipant && !viewerCreator,
          canCancel: forming && viewerCreator,
        },
      },
    };
  }
}
