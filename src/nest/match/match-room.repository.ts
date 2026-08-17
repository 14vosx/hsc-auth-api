import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { DatabaseService } from "../database/database.service.js";
import { resolveMembershipEffectiveStatus } from "../membership/membership-status.js";
import { MATCH_ROOM_CAPACITY, type MatchRoomSnapshot, type MatchRoomStatus } from "./match-room.contract.js";
import { MatchRoomError, type MatchRoomErrorCode } from "./match-room.error.js";

interface EligibilityRow extends RowDataPacket { account_status: string; has_steam: number; membership_status: string | null; membership_expires_at: Date | string | null; now_utc: Date | string }
interface RoomRow extends RowDataPacket { id: string; creator_player_account_id: string; status: MatchRoomStatus; version: string | number; confirmation_round: string | number; confirmation_started_at: Date | string | null; confirmation_deadline_at: Date | string | null; roster_locked_at: Date | string | null; confirmation_expired?: number }
interface ParticipantRow extends RowDataPacket { player_account_id: string; joined_at: Date | string; confirmed_round: string | number | null; confirmed_at: Date | string | null }
interface CountRow extends RowDataPacket { participant_count: string | number }
interface ExistsRow extends RowDataPacket { exists_flag: number }
interface IdRow extends RowDataPacket { id: string }
interface ConfirmationRow extends RowDataPacket { confirmed_round: string | number | null; confirmed_at: Date | string | null }
type MutationOutcome = { error?: MatchRoomErrorCode; retryAfterReconciliation?: boolean };

function isActivePlayerUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ER_DUP_ENTRY") return false;
  const mysqlError = error as { sqlMessage?: unknown; message?: unknown };
  const message = typeof mysqlError.sqlMessage === "string" ? mysqlError.sqlMessage : typeof mysqlError.message === "string" ? mysqlError.message : "";
  return /for key ['`](?:[^'`]*\.)?uniq_match_room_active_player['`]/i.test(message);
}

@Injectable()
export class MatchRoomRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private async inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.beginTransaction();
      try { const result = await work(connection); await connection.commit(); return result; }
      catch (error) { try { await connection.rollback(); } catch {} throw error; }
    } finally { connection.release(); }
  }

  private async inReadSnapshot<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.query("SET TRANSACTION READ ONLY");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
      try { const result = await work(connection); await connection.commit(); return result; }
      catch (error) { try { await connection.rollback(); } catch {} throw error; }
    } finally { connection.release(); }
  }

  private eligibilityError(row: EligibilityRow): MatchRoomErrorCode | null {
    if (row.account_status === "disabled") return "player_account_disabled";
    if (row.account_status !== "active") throw new TypeError("Invalid player account status.");
    if (!row.has_steam) return "steam_identity_not_linked";
    if (row.membership_status === null) return "membership_required";
    const status = resolveMembershipEffectiveStatus({ status: row.membership_status, expiresAt: row.membership_expires_at, now: row.now_utc });
    return status === "active" ? null : `membership_${status}` as MatchRoomErrorCode;
  }

  private async getEligibilityError(connection: PoolConnection, playerAccountId: string) {
    const [rows] = await connection.execute<EligibilityRow[]>(`
      SELECT a.status AS account_status,
        EXISTS(SELECT 1 FROM player_steam_identities s WHERE s.player_account_id = a.id) AS has_steam,
        m.status AS membership_status, m.expires_at AS membership_expires_at, UTC_TIMESTAMP(6) AS now_utc
      FROM player_accounts a LEFT JOIN player_memberships m ON m.player_account_id = a.id
      WHERE a.id = ? LIMIT 1
    `, [playerAccountId]);
    if (!rows[0]) throw new TypeError("Authenticated player account does not exist.");
    return this.eligibilityError(rows[0]);
  }

  private async assertEligible(connection: PoolConnection, playerAccountId: string) {
    const error = await this.getEligibilityError(connection, playerAccountId);
    if (error) throw new MatchRoomError(error);
  }

  private roomSelect(lock: boolean): string {
    return `SELECT id, creator_player_account_id, status, version,
      confirmation_round, confirmation_started_at, confirmation_deadline_at, roster_locked_at,
      (status = 'CONFIRMING' AND confirmation_deadline_at <= UTC_TIMESTAMP(6)) AS confirmation_expired
      FROM match_rooms WHERE id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`;
  }

  private async lockRoom(connection: PoolConnection, roomId: string): Promise<RoomRow> {
    const [rows] = await connection.execute<RoomRow[]>(this.roomSelect(true), [roomId]);
    if (!rows[0]) throw new MatchRoomError("room_not_found");
    return rows[0];
  }

  private async reconcileLocked(connection: PoolConnection, room: RoomRow): Promise<boolean> {
    if (room.status !== "CONFIRMING" || !Boolean(room.confirmation_expired)) return false;
    const round = Number(room.confirmation_round);
    const [creatorRows] = await connection.execute<ExistsRow[]>(`
      SELECT EXISTS(SELECT 1 FROM match_room_participants
        WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL AND confirmed_round = ?
      ) AS exists_flag
    `, [room.id, room.creator_player_account_id, round]);
    if (!Boolean(creatorRows[0]?.exists_flag)) {
      await connection.execute(`UPDATE match_rooms SET status = 'CANCELLED', cancelled_at = UTC_TIMESTAMP(6),
        confirmation_started_at = NULL, confirmation_deadline_at = NULL, version = version + 1 WHERE id = ?`, [room.id]);
      await connection.execute(`UPDATE match_room_participants
        SET released_at = UTC_TIMESTAMP(6), release_reason = 'CREATOR_CONFIRMATION_TIMEOUT'
        WHERE room_id = ? AND released_at IS NULL`, [room.id]);
      room.status = "CANCELLED";
    } else {
      await connection.execute(`UPDATE match_room_participants
        SET released_at = UTC_TIMESTAMP(6), release_reason = 'CONFIRMATION_TIMEOUT'
        WHERE room_id = ? AND released_at IS NULL AND (confirmed_round IS NULL OR confirmed_round <> ?)`, [room.id, round]);
      await connection.execute(`UPDATE match_rooms SET status = 'FORMING', confirmation_started_at = NULL,
        confirmation_deadline_at = NULL, version = version + 1 WHERE id = ?`, [room.id]);
      room.status = "FORMING";
    }
    room.confirmation_started_at = null; room.confirmation_deadline_at = null; room.confirmation_expired = 0;
    return true;
  }

  private throwOutcome(outcome: MutationOutcome): void { if (outcome.error) throw new MatchRoomError(outcome.error); }
  private async reconcileRoom(roomId: string): Promise<void> {
    await this.inTransaction(async (connection) => { const room = await this.lockRoom(connection, roomId); await this.reconcileLocked(connection, room); });
  }

  async create(playerAccountId: string): Promise<string> {
    return this.inTransaction(async (connection) => {
      await this.assertEligible(connection, playerAccountId); const roomId = randomUUID();
      try {
        await connection.execute("INSERT INTO match_rooms (id, creator_player_account_id, status, version) VALUES (?, ?, 'FORMING', 1)", [roomId, playerAccountId]);
        await connection.execute("INSERT INTO match_room_participants (id, room_id, player_account_id) VALUES (?, ?, ?)", [randomUUID(), roomId, playerAccountId]);
      } catch (error) { if (isActivePlayerUniqueViolation(error)) throw new MatchRoomError("already_in_active_room"); throw error; }
      return roomId;
    });
  }

  async join(roomId: string, playerAccountId: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (await this.reconcileLocked(connection, room)) return { retryAfterReconciliation: true };
      if (room.status !== "FORMING") return { error: "room_not_joinable" };
      await this.assertEligible(connection, playerAccountId);
      const [sameRoom] = await connection.execute<CountRow[]>(`SELECT COUNT(*) AS participant_count FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL`, [roomId, playerAccountId]);
      if (Number(sameRoom[0]?.participant_count ?? 0) > 0) return { error: "already_in_room" };
      const [counts] = await connection.execute<CountRow[]>(`SELECT COUNT(*) AS participant_count FROM match_room_participants WHERE room_id = ? AND released_at IS NULL`, [roomId]);
      const count = Number(counts[0]?.participant_count ?? 0);
      if (count >= MATCH_ROOM_CAPACITY) return { error: "room_full" };
      try { await connection.execute("INSERT INTO match_room_participants (id, room_id, player_account_id) VALUES (?, ?, ?)", [randomUUID(), roomId, playerAccountId]); }
      catch (error) { if (isActivePlayerUniqueViolation(error)) return { error: "already_in_active_room" }; throw error; }
      if (count + 1 === MATCH_ROOM_CAPACITY) {
        await connection.execute(`UPDATE match_rooms SET status = 'CONFIRMING', confirmation_round = confirmation_round + 1,
          confirmation_started_at = UTC_TIMESTAMP(6), confirmation_deadline_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND),
          version = version + 1 WHERE id = ?`, [roomId]);
      } else await connection.execute("UPDATE match_rooms SET version = version + 1 WHERE id = ?", [roomId]);
      return {};
    });
    if (outcome.retryAfterReconciliation) return this.join(roomId, playerAccountId);
    this.throwOutcome(outcome);
  }

  async leave(roomId: string, playerAccountId: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (await this.reconcileLocked(connection, room)) return { retryAfterReconciliation: true };
      if (room.status !== "FORMING") return { error: "room_not_joinable" };
      if (room.creator_player_account_id === playerAccountId) return { error: "creator_must_cancel_room" };
      const [result] = await connection.execute<ResultSetHeader>(`UPDATE match_room_participants SET released_at = UTC_TIMESTAMP(6), release_reason = 'LEFT' WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL`, [roomId, playerAccountId]);
      if (result.affectedRows !== 1) return { error: "not_room_participant" };
      await connection.execute("UPDATE match_rooms SET version = version + 1 WHERE id = ?", [roomId]); return {};
    });
    if (outcome.retryAfterReconciliation) return this.leave(roomId, playerAccountId);
    this.throwOutcome(outcome);
  }

  async cancel(roomId: string, playerAccountId: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (await this.reconcileLocked(connection, room)) return { retryAfterReconciliation: true };
      if (room.creator_player_account_id !== playerAccountId) return { error: "not_room_creator" };
      if (!(["FORMING", "CONFIRMING", "SETUP"] as MatchRoomStatus[]).includes(room.status)) return { error: "room_not_cancellable" };
      await connection.execute(`UPDATE match_rooms SET status = 'CANCELLED', cancelled_at = UTC_TIMESTAMP(6), confirmation_started_at = NULL, confirmation_deadline_at = NULL, version = version + 1 WHERE id = ?`, [roomId]);
      await connection.execute(`UPDATE match_room_participants SET released_at = UTC_TIMESTAMP(6), release_reason = 'ROOM_CANCELLED' WHERE room_id = ? AND released_at IS NULL`, [roomId]); return {};
    });
    if (outcome.retryAfterReconciliation) return this.cancel(roomId, playerAccountId);
    this.throwOutcome(outcome);
  }

  async confirm(roomId: string, playerAccountId: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (room.status === "SETUP") {
        const [rows] = await connection.execute<ConfirmationRow[]>(`SELECT confirmed_round, confirmed_at FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1`, [roomId, playerAccountId]);
        return Number(rows[0]?.confirmed_round) === Number(room.confirmation_round) ? {} : { error: "room_not_confirmable" };
      }
      if (await this.reconcileLocked(connection, room)) return { error: "confirmation_window_closed" };
      if (room.status !== "CONFIRMING") return { error: "room_not_confirmable" };
      const round = Number(room.confirmation_round);
      const [participants] = await connection.execute<ConfirmationRow[]>(`SELECT confirmed_round, confirmed_at FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1`, [roomId, playerAccountId]);
      if (!participants[0]) return { error: "not_room_participant" };
      if (Number(participants[0].confirmed_round) === round) return {};
      await connection.execute(`UPDATE match_room_participants SET confirmed_round = ?, confirmed_at = UTC_TIMESTAMP(6) WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL`, [round, roomId, playerAccountId]);
      const [counts] = await connection.execute<CountRow[]>(`SELECT COUNT(*) AS participant_count FROM match_room_participants WHERE room_id = ? AND released_at IS NULL AND confirmed_round = ?`, [roomId, round]);
      if (Number(counts[0]?.participant_count ?? 0) === MATCH_ROOM_CAPACITY) {
        await connection.execute(`UPDATE match_rooms SET status = 'SETUP', roster_locked_at = UTC_TIMESTAMP(6), confirmation_started_at = NULL, confirmation_deadline_at = NULL, version = version + 1 WHERE id = ?`, [roomId]);
      } else await connection.execute("UPDATE match_rooms SET version = version + 1 WHERE id = ?", [roomId]);
      return {};
    }); this.throwOutcome(outcome);
  }

  async getById(roomId: string, viewerId: string): Promise<MatchRoomSnapshot | null> {
    try { await this.reconcileRoom(roomId); } catch (error) { if (error instanceof MatchRoomError && error.code === "room_not_found") return null; throw error; }
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(this.roomSelect(false), [roomId]); if (!rooms[0]) return null;
      return this.buildSnapshot(connection, rooms[0], viewerId, await this.readViewerContext(connection, viewerId));
    });
  }

  async getCurrent(viewerId: string): Promise<MatchRoomSnapshot | null> {
    const [active] = await this.databaseService.getPool().execute<IdRow[]>(`SELECT room_id AS id FROM match_room_participants WHERE player_account_id = ? AND released_at IS NULL LIMIT 1`, [viewerId]);
    if (active[0]) await this.reconcileRoom(active[0].id);
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`SELECT r.id, r.creator_player_account_id, r.status, r.version, r.confirmation_round, r.confirmation_started_at, r.confirmation_deadline_at, r.roster_locked_at, 0 AS confirmation_expired FROM match_room_participants p JOIN match_rooms r ON r.id = p.room_id WHERE p.player_account_id = ? AND p.released_at IS NULL LIMIT 1`, [viewerId]);
      if (!rooms[0]) return null; return this.buildSnapshot(connection, rooms[0], viewerId, await this.readViewerContext(connection, viewerId));
    });
  }

  async listRelevant(viewerId: string): Promise<MatchRoomSnapshot[]> {
    const [expired] = await this.databaseService.getPool().execute<IdRow[]>(`SELECT id FROM match_rooms WHERE status = 'CONFIRMING' AND confirmation_deadline_at <= UTC_TIMESTAMP(6)`);
    for (const row of expired) await this.reconcileRoom(row.id);
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`SELECT DISTINCT r.id, r.creator_player_account_id, r.status, r.version, r.confirmation_round, r.confirmation_started_at, r.confirmation_deadline_at, r.roster_locked_at, 0 AS confirmation_expired FROM match_rooms r LEFT JOIN match_room_participants p ON p.room_id = r.id AND p.player_account_id = ? AND p.released_at IS NULL WHERE r.status = 'FORMING' OR p.id IS NOT NULL ORDER BY r.created_at ASC, r.id ASC`, [viewerId]);
      const context = await this.readViewerContext(connection, viewerId); return Promise.all(rooms.map((room) => this.buildSnapshot(connection, room, viewerId, context)));
    });
  }

  private async readViewerContext(connection: PoolConnection, viewerId: string) {
    const eligibilityError = await this.getEligibilityError(connection, viewerId);
    const [activeRows] = await connection.execute<ExistsRow[]>(`SELECT EXISTS(SELECT 1 FROM match_room_participants WHERE player_account_id = ? AND released_at IS NULL) AS exists_flag`, [viewerId]);
    return { eligible: eligibilityError === null, hasActiveRoom: Boolean(activeRows[0]?.exists_flag) };
  }

  private async buildSnapshot(connection: PoolConnection, room: RoomRow, viewerId: string, context: { eligible: boolean; hasActiveRoom: boolean }): Promise<MatchRoomSnapshot> {
    const [participants] = await connection.execute<ParticipantRow[]>(`SELECT player_account_id, joined_at, confirmed_round, confirmed_at FROM match_room_participants WHERE room_id = ? AND released_at IS NULL ORDER BY joined_at ASC, id ASC`, [room.id]);
    const round = Number(room.confirmation_round);
    const participantSnapshots = participants.map((participant) => {
      const confirmed = Number(participant.confirmed_round) === round && round > 0;
      return { playerAccountId: participant.player_account_id, joinedAt: participant.joined_at, confirmation: { confirmed, confirmedAt: confirmed ? participant.confirmed_at : null } };
    });
    const viewer = participantSnapshots.find((participant) => participant.playerAccountId === viewerId);
    const viewerParticipant = Boolean(viewer); const viewerCreator = room.creator_player_account_id === viewerId;
    const forming = room.status === "FORMING"; const confirming = room.status === "CONFIRMING";
    const confirmedCount = participantSnapshots.filter((participant) => participant.confirmation.confirmed).length;
    return {
      room: { id: room.id, status: room.status, version: Number(room.version), creator: { playerAccountId: room.creator_player_account_id }, participantCount: participants.length, capacity: MATCH_ROOM_CAPACITY,
        confirmation: confirming && room.confirmation_started_at && room.confirmation_deadline_at ? { round, startedAt: room.confirmation_started_at, deadlineAt: room.confirmation_deadline_at, confirmedCount } : null,
        rosterLockedAt: room.roster_locked_at, participants: participantSnapshots },
      viewer: { participant: viewerParticipant, creator: viewerCreator, actions: {
        canJoin: forming && context.eligible && !context.hasActiveRoom && participants.length < MATCH_ROOM_CAPACITY,
        canLeave: forming && viewerParticipant && !viewerCreator,
        canCancel: viewerCreator && (["FORMING", "CONFIRMING", "SETUP"] as MatchRoomStatus[]).includes(room.status),
        canConfirm: confirming && viewerParticipant && !viewer?.confirmation.confirmed,
      } },
    };
  }
}
