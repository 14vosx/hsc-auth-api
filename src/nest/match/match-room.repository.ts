import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { DatabaseService } from "../database/database.service.js";
import { resolveMembershipEffectiveStatus } from "../membership/membership-status.js";
import {
  MIX_5V5_MAP_POOL_KEY,
} from "./map-pool/match-map-pool.contract.js";
import { validateMatchMapPoolInvariants } from "./map-pool/match-map-pool.invariants.js";
import { MatchMapPoolRepository } from "./map-pool/match-map-pool.repository.js";
import { CompetitiveMatchRepository } from "./competitive-match/competitive-match.repository.js";
import { validateCompetitiveMatchSetupInvariants } from "./competitive-match/competitive-match.invariants.js";
import {
  MATCH_ROOM_CAPACITY,
  type MatchRoomAggregateSnapshot,
  type MatchRoomDraftAssignmentSnapshot,
  type MatchRoomDraftAssignmentSource,
  type MatchRoomDraftPhase,
  type MatchRoomDraftSnapshot,
  type MatchRoomMapVetoActionSnapshot,
  type MatchRoomMapVetoActionSource,
  type MatchRoomMapVetoPhase,
  type MatchRoomMapVetoSnapshot,
  type MatchRoomStatus,
} from "./match-room.contract.js";
import { MatchRoomError, type MatchRoomErrorCode } from "./match-room.error.js";

interface EligibilityRow extends RowDataPacket { account_status: string; has_steam: number; membership_status: string | null; membership_expires_at: Date | string | null; now_utc: Date | string }
interface RoomRow extends RowDataPacket { id: string; creator_player_account_id: string; status: MatchRoomStatus; version: string | number; confirmation_round: string | number; confirmation_started_at: Date | string | null; confirmation_deadline_at: Date | string | null; roster_locked_at: Date | string | null; ready_at: Date | string | null; confirmation_expired?: number; draft_expired?: number; veto_expired?: number }
interface ParticipantRow extends RowDataPacket { player_account_id: string; joined_at: Date | string; confirmed_round: string | number | null; confirmed_at: Date | string | null }
interface CountRow extends RowDataPacket { participant_count: string | number }
interface ExistsRow extends RowDataPacket { exists_flag: number }
interface IdRow extends RowDataPacket { id: string }
interface ConfirmationRow extends RowDataPacket { confirmed_round: string | number | null; confirmed_at: Date | string | null }
interface DraftRow extends RowDataPacket {
  room_id: string;
  captain_a_player_account_id: string;
  captain_b_player_account_id: string;
  first_picker_player_account_id: string;
  current_picker_player_account_id: string | null;
  next_selection_order: string | number | null;
  pick_deadline_at: Date | string | null;
  completed_at: Date | string | null;
  draft_expired?: number;
}
interface AssignmentRow extends RowDataPacket {
  room_id: string;
  player_account_id: string;
  team: string;
  captain: number;
  selection_order: string | number | null;
  source: string;
  picker_player_account_id: string | null;
  assigned_at: Date | string;
}
interface VetoRow extends RowDataPacket {
  room_id: string;
  pool_id: string;
  first_vetoer_player_account_id: string;
  current_vetoer_player_account_id: string | null;
  next_action_order: string | number | null;
  action_deadline_at: Date | string | null;
  selected_map_key: string | null;
  completed_at: Date | string | null;
  veto_expired?: number;
}
interface VetoActionRow extends RowDataPacket {
  room_id: string;
  pool_id: string;
  action_order: string | number;
  map_key: string;
  actor_player_account_id: string;
  source: string;
  acted_at: Date | string;
}

type MutationOutcome = { error?: MatchRoomErrorCode; retryAfterReconciliation?: boolean };

function isActivePlayerUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ER_DUP_ENTRY") return false;
  const mysqlError = error as { sqlMessage?: unknown; message?: unknown };
  const message = typeof mysqlError.sqlMessage === "string" ? mysqlError.sqlMessage : typeof mysqlError.message === "string" ? mysqlError.message : "";
  return /for key ['`](?:[^'`]*\.)?uniq_match_room_active_player['`]/i.test(message);
}

@Injectable()
export class MatchRoomRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly matchMapPoolRepository: MatchMapPoolRepository,
    private readonly competitiveMatchRepository: CompetitiveMatchRepository,
  ) {}

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
      confirmation_round, confirmation_started_at, confirmation_deadline_at, roster_locked_at, ready_at,
      (status = 'CONFIRMING' AND confirmation_deadline_at <= UTC_TIMESTAMP(6)) AS confirmation_expired,
      (status = 'SETUP' AND EXISTS(SELECT 1 FROM match_room_drafts d WHERE d.room_id = match_rooms.id AND d.completed_at IS NULL AND d.pick_deadline_at <= UTC_TIMESTAMP(6))) AS draft_expired,
      (status = 'SETUP' AND EXISTS(SELECT 1 FROM match_room_map_vetos v WHERE v.room_id = match_rooms.id AND v.completed_at IS NULL AND v.action_deadline_at <= UTC_TIMESTAMP(6))) AS veto_expired
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

  private async initializeDraft(connection: PoolConnection, roomId: string): Promise<void> {
    const [participants] = await connection.execute<ParticipantRow[]>(`
      SELECT player_account_id FROM match_room_participants
      WHERE room_id = ? AND released_at IS NULL ORDER BY joined_at ASC
    `, [roomId]);
    if (participants.length !== MATCH_ROOM_CAPACITY) {
      throw new TypeError(`Expected exactly ${MATCH_ROOM_CAPACITY} participants for draft initialization.`);
    }

    const indices = Array.from({ length: MATCH_ROOM_CAPACITY }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }
    const captainAId = participants[indices[0]!]!.player_account_id;
    const captainBId = participants[indices[1]!]!.player_account_id;
    const firstPickerId = Math.random() < 0.5 ? captainAId : captainBId;

    await connection.execute(`
      INSERT INTO match_room_drafts (
        room_id, captain_a_player_account_id, captain_b_player_account_id,
        first_picker_player_account_id, current_picker_player_account_id,
        next_selection_order, pick_deadline_at
      ) VALUES (?, ?, ?, ?, ?, 1, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND))
    `, [roomId, captainAId, captainBId, firstPickerId, firstPickerId]);

    await connection.execute(`
      INSERT INTO match_room_draft_assignments (
        room_id, player_account_id, team, captain, selection_order, source, picker_player_account_id
      ) VALUES
        (?, ?, 'A', 1, NULL, 'CAPTAIN', NULL),
        (?, ?, 'B', 1, NULL, 'CAPTAIN', NULL)
    `, [roomId, captainAId, roomId, captainBId]);
  }

  private async initializeMapVetoOnConnection(
    connection: PoolConnection,
    roomId: string,
    captainAId: string,
    captainBId: string,
  ): Promise<void> {
    const rawPool = await this.matchMapPoolRepository.findActivePoolOnConnection(
      connection,
      MIX_5V5_MAP_POOL_KEY,
    );
    const pool = validateMatchMapPoolInvariants(rawPool, MIX_5V5_MAP_POOL_KEY);
    const firstVetoerId = Math.random() < 0.5 ? captainAId : captainBId;

    await connection.execute(`
      INSERT INTO match_room_map_vetos (
        room_id, pool_id, first_vetoer_player_account_id,
        current_vetoer_player_account_id, next_action_order, action_deadline_at
      ) VALUES (?, ?, ?, ?, 1, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND))
    `, [roomId, pool.id, firstVetoerId, firstVetoerId]);
  }

  private async materializeCompetitiveMatchOnConnection(
    connection: PoolConnection,
    roomId: string,
  ): Promise<void> {
    const [existing] = await connection.execute<ExistsRow[]>(
      `SELECT EXISTS(SELECT 1 FROM competitive_matches WHERE room_id = ?) AS exists_flag`,
      [roomId],
    );
    if (Boolean(existing[0]?.exists_flag)) {
      return;
    }

    const [draftRows] = await connection.execute<DraftRow[]>(
      `SELECT completed_at FROM match_room_drafts WHERE room_id = ?`,
      [roomId],
    );
    const draft = draftRows[0];

    const [vetoRows] = await connection.execute<VetoRow[]>(
      `SELECT pool_id, selected_map_key, completed_at FROM match_room_map_vetos WHERE room_id = ?`,
      [roomId],
    );
    const veto = vetoRows[0];

    let mapMetadata: {
      poolId: string;
      poolKey: string;
      poolVersion: number;
      mapKey: string;
      displayName: string;
    } | null = null;

    if (veto && veto.pool_id && veto.selected_map_key) {
      const [poolRows] = await connection.execute<RowDataPacket[]>(
        `SELECT p.id AS pool_id, p.pool_key, p.version AS pool_version, e.map_key, e.display_name
         FROM match_map_pools p
         JOIN match_map_pool_entries e ON e.pool_id = p.id
         WHERE p.id = ? AND e.map_key = ? LIMIT 1`,
        [veto.pool_id, veto.selected_map_key],
      );
      const row = poolRows[0];
      if (row) {
        mapMetadata = {
          poolId: row.pool_id,
          poolKey: row.pool_key,
          poolVersion: Number(row.pool_version),
          mapKey: row.map_key,
          displayName: row.display_name,
        };
      }
    }

    const [participants] = await connection.execute<ParticipantRow[]>(
      `SELECT player_account_id FROM match_room_participants WHERE room_id = ? AND released_at IS NULL`,
      [roomId],
    );
    const participantAccountIds = participants.map((p) => p.player_account_id);

    const [assignments] = await connection.execute<AssignmentRow[]>(
      `SELECT player_account_id, team FROM match_room_draft_assignments WHERE room_id = ?`,
      [roomId],
    );

    const [steamRows] = await connection.execute<RowDataPacket[]>(
      `SELECT player_account_id, steamid64 FROM player_steam_identities
       WHERE player_account_id IN (${participantAccountIds.map(() => "?").join(",") || "''"})`,
      participantAccountIds,
    );
    const steamIdentities = steamRows.map((r) => ({
      playerAccountId: r.player_account_id as string,
      steamid64: r.steamid64 as string,
    }));

    const validated = validateCompetitiveMatchSetupInvariants({
      roomStatus: "SETUP",
      draftCompleted: draft?.completed_at !== null && draft?.completed_at !== undefined,
      vetoCompleted: veto?.completed_at !== null && veto?.completed_at !== undefined,
      selectedMapKey: veto?.selected_map_key ?? null,
      mapMetadata,
      participantAccountIds,
      draftAssignments: assignments.map((a) => ({
        playerAccountId: a.player_account_id,
        team: a.team,
      })),
      steamIdentities,
    });

    await this.competitiveMatchRepository.createOnConnection(connection, {
      roomId,
      map: validated.map,
      roster: validated.roster,
    });
  }

  private async reconcileDraftLocked(connection: PoolConnection, room: RoomRow, draft: DraftRow): Promise<boolean> {
    if (draft.completed_at !== null || !Boolean(draft.draft_expired)) return false;

    let currentPicker = draft.current_picker_player_account_id;
    let nextOrder = Number(draft.next_selection_order ?? 1);
    const captainAId = draft.captain_a_player_account_id;
    const captainBId = draft.captain_b_player_account_id;

    while (currentPicker !== null) {
      const [participants] = await connection.execute<ParticipantRow[]>(`
        SELECT player_account_id FROM match_room_participants
        WHERE room_id = ? AND released_at IS NULL
      `, [room.id]);
      const [assignments] = await connection.execute<AssignmentRow[]>(`
        SELECT player_account_id, team FROM match_room_draft_assignments
        WHERE room_id = ?
      `, [room.id]);

      const assignedIds = new Set(assignments.map((a) => a.player_account_id));
      const unassigned = participants.filter((p) => !assignedIds.has(p.player_account_id));

      if (unassigned.length === 0) {
        await connection.execute(`
          UPDATE match_room_drafts
          SET current_picker_player_account_id = NULL, next_selection_order = NULL,
              pick_deadline_at = NULL, completed_at = UTC_TIMESTAMP(6)
          WHERE room_id = ?
        `, [room.id]);
        await this.initializeMapVetoOnConnection(connection, room.id, captainAId, captainBId);
        break;
      }

      const pickerAssignment = assignments.find((a) => a.player_account_id === currentPicker);
      if (!pickerAssignment) throw new TypeError("Current picker does not have captain assignment.");
      const pickerTeam = pickerAssignment.team;

      const randomIndex = Math.floor(Math.random() * unassigned.length);
      const targetPlayerId = unassigned[randomIndex]!.player_account_id;

      await connection.execute(`
        INSERT INTO match_room_draft_assignments (
          room_id, player_account_id, team, captain, selection_order, source, picker_player_account_id
        ) VALUES (?, ?, ?, 0, ?, 'TIMEOUT_AUTO_PICK', ?)
      `, [room.id, targetPlayerId, pickerTeam, nextOrder, currentPicker]);

      const remainingAfterAutoPick = unassigned.length - 1;

      if (remainingAfterAutoPick > 1) {
        currentPicker = currentPicker === captainAId ? captainBId : captainAId;
        nextOrder += 1;
        await connection.execute(`
          UPDATE match_room_drafts
          SET current_picker_player_account_id = ?,
              next_selection_order = ?,
              pick_deadline_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
          WHERE room_id = ?
        `, [currentPicker, nextOrder, room.id]);
        break;
      } else if (remainingAfterAutoPick === 1) {
        const newlyAssigned = new Set([...assignedIds, targetPlayerId]);
        const lastParticipant = participants.find((p) => !newlyAssigned.has(p.player_account_id));
        if (!lastParticipant) throw new TypeError("Expected one remaining player for auto-assignment.");

        const teamACount = assignments.filter((a) => a.team === "A").length + (pickerTeam === "A" ? 1 : 0);
        const lastTeam = teamACount === 4 ? "A" : "B";

        await connection.execute(`
          INSERT INTO match_room_draft_assignments (
            room_id, player_account_id, team, captain, selection_order, source, picker_player_account_id
          ) VALUES (?, ?, ?, 0, 8, 'LAST_REMAINING', NULL)
        `, [room.id, lastParticipant.player_account_id, lastTeam]);

        await connection.execute(`
          UPDATE match_room_drafts
          SET current_picker_player_account_id = NULL,
              next_selection_order = NULL,
              pick_deadline_at = NULL,
              completed_at = UTC_TIMESTAMP(6)
          WHERE room_id = ?
        `, [room.id]);
        await this.initializeMapVetoOnConnection(connection, room.id, captainAId, captainBId);
        currentPicker = null;
        break;
      }
    }

    await connection.execute(`UPDATE match_rooms SET version = version + 1 WHERE id = ?`, [room.id]);
    room.version = Number(room.version) + 1;
    return true;
  }

  private async reconcileVetoRecoveryLocked(
    connection: PoolConnection,
    room: RoomRow,
  ): Promise<boolean> {
    if (room.status !== "SETUP") return false;

    const [draftRows] = await connection.execute<DraftRow[]>(`
      SELECT room_id, captain_a_player_account_id, captain_b_player_account_id, completed_at
      FROM match_room_drafts WHERE room_id = ? FOR UPDATE
    `, [room.id]);
    const draft = draftRows[0];
    if (!draft || draft.completed_at === null) return false;

    const [vetoRows] = await connection.execute<ExistsRow[]>(`
      SELECT EXISTS(SELECT 1 FROM match_room_map_vetos WHERE room_id = ?) AS exists_flag
    `, [room.id]);

    if (!Boolean(vetoRows[0]?.exists_flag)) {
      await this.initializeMapVetoOnConnection(
        connection,
        room.id,
        draft.captain_a_player_account_id,
        draft.captain_b_player_account_id,
      );
      await connection.execute(`UPDATE match_rooms SET version = version + 1 WHERE id = ?`, [room.id]);
      room.version = Number(room.version) + 1;
      return true;
    }

    return false;
  }

  private async reconcileVetoTimeoutLocked(
    connection: PoolConnection,
    room: RoomRow,
    veto: VetoRow,
  ): Promise<boolean> {
    if (veto.completed_at !== null || !Boolean(veto.veto_expired)) return false;

    const currentVetoer = veto.current_vetoer_player_account_id;
    if (!currentVetoer) return false;

    const nextOrder = Number(veto.next_action_order ?? 1);

    const [draftRows] = await connection.execute<DraftRow[]>(`
      SELECT captain_a_player_account_id, captain_b_player_account_id
      FROM match_room_drafts WHERE room_id = ?
    `, [room.id]);
    const draft = draftRows[0];
    if (!draft) throw new TypeError("Draft not found for map veto timeout reconciliation.");

    const captainAId = draft.captain_a_player_account_id;
    const captainBId = draft.captain_b_player_account_id;

    const [entryRows] = await connection.execute<RowDataPacket[]>(`
      SELECT map_key FROM match_map_pool_entries WHERE pool_id = ? ORDER BY position ASC
    `, [veto.pool_id]);
    const poolMapKeys = entryRows.map((r) => r.map_key as string);

    const [actionRows] = await connection.execute<VetoActionRow[]>(`
      SELECT map_key FROM match_room_map_veto_actions WHERE room_id = ?
    `, [room.id]);
    const bannedKeys = new Set(actionRows.map((a) => a.map_key));

    const unbannedKeys = poolMapKeys.filter((k) => !bannedKeys.has(k));
    if (unbannedKeys.length === 0) return false;

    const randomIndex = Math.floor(Math.random() * unbannedKeys.length);
    const targetMapKey = unbannedKeys[randomIndex]!;

    await connection.execute(`
      INSERT INTO match_room_map_veto_actions (
        room_id, pool_id, action_order, map_key, actor_player_account_id, source
      ) VALUES (?, ?, ?, ?, ?, 'TIMEOUT_AUTO_BAN')
    `, [room.id, veto.pool_id, nextOrder, targetMapKey, currentVetoer]);

    const remainingUnbanned = unbannedKeys.length - 1;

    if (nextOrder < 6 && remainingUnbanned > 1) {
      const nextVetoer = currentVetoer === captainAId ? captainBId : captainAId;
      await connection.execute(`
        UPDATE match_room_map_vetos
        SET current_vetoer_player_account_id = ?,
            next_action_order = next_action_order + 1,
            action_deadline_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
        WHERE room_id = ?
      `, [nextVetoer, room.id]);
      await connection.execute(`UPDATE match_rooms SET version = version + 1 WHERE id = ?`, [room.id]);
      room.version = Number(room.version) + 1;
    } else {
      const allBanned = new Set([...bannedKeys, targetMapKey]);
      const lastMapKey = poolMapKeys.find((k) => !allBanned.has(k));
      if (!lastMapKey) throw new TypeError("Expected one remaining map for veto completion.");

      await connection.execute(`
        UPDATE match_room_map_vetos
        SET current_vetoer_player_account_id = NULL,
            next_action_order = NULL,
            action_deadline_at = NULL,
            selected_map_key = ?,
            completed_at = UTC_TIMESTAMP(6)
        WHERE room_id = ?
      `, [lastMapKey, room.id]);

      await this.materializeCompetitiveMatchOnConnection(connection, room.id);
      await connection.execute(`UPDATE match_rooms SET status = 'READY', ready_at = UTC_TIMESTAMP(6), version = version + 1 WHERE id = ?`, [room.id]);
      room.version = Number(room.version) + 1;
      room.status = "READY";
    }

    return true;
  }

  private throwOutcome(outcome: MutationOutcome): void { if (outcome.error) throw new MatchRoomError(outcome.error); }

  private async reconcileRoom(roomId: string): Promise<void> {
    await this.inTransaction(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (!(await this.reconcileLocked(connection, room))) {
        if (room.status === "SETUP") {
          if (Boolean(room.draft_expired)) {
            const [draftRows] = await connection.execute<DraftRow[]>(`
              SELECT room_id, captain_a_player_account_id, captain_b_player_account_id,
                first_picker_player_account_id, current_picker_player_account_id,
                next_selection_order, pick_deadline_at, completed_at,
                (completed_at IS NULL AND pick_deadline_at <= UTC_TIMESTAMP(6)) AS draft_expired
              FROM match_room_drafts WHERE room_id = ? FOR UPDATE
            `, [roomId]);
            if (draftRows[0] && Boolean(draftRows[0].draft_expired)) {
              await this.reconcileDraftLocked(connection, room, draftRows[0]);
            }
          }

          await this.reconcileVetoRecoveryLocked(connection, room);

          if (room.status === "SETUP" && Boolean(room.veto_expired)) {
            const [vetoRows] = await connection.execute<VetoRow[]>(`
              SELECT room_id, pool_id, first_vetoer_player_account_id,
                current_vetoer_player_account_id, next_action_order,
                action_deadline_at, selected_map_key, completed_at,
                (completed_at IS NULL AND action_deadline_at <= UTC_TIMESTAMP(6)) AS veto_expired
              FROM match_room_map_vetos WHERE room_id = ? FOR UPDATE
            `, [roomId]);
            if (vetoRows[0] && Boolean(vetoRows[0].veto_expired)) {
              await this.reconcileVetoTimeoutLocked(connection, room, vetoRows[0]);
            }
          }

          if (room.status === "SETUP") {
            const [draftRows] = await connection.execute<DraftRow[]>(`
              SELECT completed_at FROM match_room_drafts WHERE room_id = ?
            `, [roomId]);
            const [vetoRows] = await connection.execute<VetoRow[]>(`
              SELECT completed_at FROM match_room_map_vetos WHERE room_id = ?
            `, [roomId]);

            if (draftRows[0]?.completed_at !== null && draftRows[0]?.completed_at !== undefined &&
                vetoRows[0]?.completed_at !== null && vetoRows[0]?.completed_at !== undefined) {
              const [matchRows] = await connection.execute<ExistsRow[]>(`
                SELECT EXISTS(SELECT 1 FROM competitive_matches WHERE room_id = ?) AS exists_flag
              `, [roomId]);

              if (!Boolean(matchRows[0]?.exists_flag)) {
                await this.materializeCompetitiveMatchOnConnection(connection, roomId);
                await connection.execute(`UPDATE match_rooms SET status = 'READY', ready_at = UTC_TIMESTAMP(6), version = version + 1 WHERE id = ?`, [roomId]);
                room.version = Number(room.version) + 1;
                room.status = "READY";
              } else {
                await connection.execute(`UPDATE match_rooms SET status = 'READY', ready_at = COALESCE(ready_at, UTC_TIMESTAMP(6)), version = version + 1 WHERE id = ?`, [roomId]);
                room.version = Number(room.version) + 1;
                room.status = "READY";
              }
            }
          }
        }
      }
    });
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
      if (room.status === "SETUP" || room.status === "READY" || room.status === "PROVISIONING") {
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
        await this.initializeDraft(connection, roomId);
      } else await connection.execute("UPDATE match_rooms SET version = version + 1 WHERE id = ?", [roomId]);
      return {};
    }); this.throwOutcome(outcome);
  }

  async draftPick(roomId: string, viewerId: string, targetPlayerAccountId: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (await this.reconcileLocked(connection, room)) return { retryAfterReconciliation: true };
      if (room.status !== "SETUP") return { error: "room_not_drafting" };

      const [draftRows] = await connection.execute<DraftRow[]>(`
        SELECT room_id, captain_a_player_account_id, captain_b_player_account_id,
          first_picker_player_account_id, current_picker_player_account_id,
          next_selection_order, pick_deadline_at, completed_at,
          (completed_at IS NULL AND pick_deadline_at <= UTC_TIMESTAMP(6)) AS draft_expired
        FROM match_room_drafts WHERE room_id = ? FOR UPDATE
      `, [roomId]);
      const draft = draftRows[0];
      if (!draft || draft.completed_at !== null) return { error: "room_not_drafting" };

      if (Boolean(draft.draft_expired)) {
        await this.reconcileDraftLocked(connection, room, draft);
        return { error: "draft_window_closed" };
      }

      if (viewerId !== draft.current_picker_player_account_id) {
        return { error: "not_draft_picker" };
      }

      const [participants] = await connection.execute<ParticipantRow[]>(`
        SELECT player_account_id FROM match_room_participants
        WHERE room_id = ? AND released_at IS NULL
      `, [roomId]);
      const isParticipant = participants.some((p) => p.player_account_id === targetPlayerAccountId);
      if (!isParticipant) return { error: "draft_target_not_available" };

      if (
        targetPlayerAccountId === draft.captain_a_player_account_id ||
        targetPlayerAccountId === draft.captain_b_player_account_id
      ) {
        return { error: "draft_target_not_available" };
      }

      const [assignments] = await connection.execute<AssignmentRow[]>(`
        SELECT player_account_id, team FROM match_room_draft_assignments
        WHERE room_id = ?
      `, [roomId]);
      if (assignments.some((a) => a.player_account_id === targetPlayerAccountId)) {
        return { error: "draft_target_not_available" };
      }

      const pickerAssignment = assignments.find((a) => a.player_account_id === viewerId);
      if (!pickerAssignment) return { error: "not_draft_picker" };
      const pickerTeam = pickerAssignment.team;

      const selectionOrder = Number(draft.next_selection_order);
      await connection.execute(`
        INSERT INTO match_room_draft_assignments
          (room_id, player_account_id, team, captain, selection_order, source, picker_player_account_id)
        VALUES (?, ?, ?, 0, ?, 'MANUAL_PICK', ?)
      `, [roomId, targetPlayerAccountId, pickerTeam, selectionOrder, viewerId]);

      const totalAssigned = assignments.length + 1;
      const remainingCount = MATCH_ROOM_CAPACITY - totalAssigned;

      if (remainingCount > 1) {
        const nextPicker = viewerId === draft.captain_a_player_account_id
          ? draft.captain_b_player_account_id
          : draft.captain_a_player_account_id;
        await connection.execute(`
          UPDATE match_room_drafts
          SET current_picker_player_account_id = ?,
              next_selection_order = next_selection_order + 1,
              pick_deadline_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
          WHERE room_id = ?
        `, [nextPicker, roomId]);
      } else if (remainingCount === 1) {
        const assignedIds = new Set([...assignments.map((a) => a.player_account_id), targetPlayerAccountId]);
        const remainingParticipant = participants.find((p) => !assignedIds.has(p.player_account_id));
        if (!remainingParticipant) throw new TypeError("Expected one remaining player for auto-assignment.");

        const teamACount = assignments.filter((a) => a.team === "A").length + (pickerTeam === "A" ? 1 : 0);
        const lastTeam = teamACount === 4 ? "A" : "B";

        await connection.execute(`
          INSERT INTO match_room_draft_assignments
            (room_id, player_account_id, team, captain, selection_order, source, picker_player_account_id)
          VALUES (?, ?, ?, 0, 8, 'LAST_REMAINING', NULL)
        `, [roomId, remainingParticipant.player_account_id, lastTeam]);

        await connection.execute(`
          UPDATE match_room_drafts
          SET current_picker_player_account_id = NULL,
              next_selection_order = NULL,
              pick_deadline_at = NULL,
              completed_at = UTC_TIMESTAMP(6)
          WHERE room_id = ?
        `, [roomId]);

        await this.initializeMapVetoOnConnection(
          connection,
          roomId,
          draft.captain_a_player_account_id,
          draft.captain_b_player_account_id,
        );
      }

      await connection.execute(`UPDATE match_rooms SET version = version + 1 WHERE id = ?`, [roomId]);
      return {};
    });

    if (outcome.retryAfterReconciliation) return this.draftPick(roomId, viewerId, targetPlayerAccountId);
    this.throwOutcome(outcome);
  }

  async mapVetoBan(roomId: string, viewerId: string, mapKey: string): Promise<void> {
    const outcome = await this.inTransaction<MutationOutcome>(async (connection) => {
      const room = await this.lockRoom(connection, roomId);
      if (await this.reconcileLocked(connection, room)) return { retryAfterReconciliation: true };
      if (room.status !== "SETUP") return { error: "room_not_vetoing" };

      const [draftRows] = await connection.execute<DraftRow[]>(`
        SELECT captain_a_player_account_id, captain_b_player_account_id, completed_at
        FROM match_room_drafts WHERE room_id = ?
      `, [roomId]);
      const draft = draftRows[0];
      if (!draft || draft.completed_at === null) return { error: "room_not_vetoing" };

      const [vetoRows] = await connection.execute<VetoRow[]>(`
        SELECT room_id, pool_id, first_vetoer_player_account_id,
          current_vetoer_player_account_id, next_action_order,
          action_deadline_at, selected_map_key, completed_at,
          (completed_at IS NULL AND action_deadline_at <= UTC_TIMESTAMP(6)) AS veto_expired
        FROM match_room_map_vetos WHERE room_id = ? FOR UPDATE
      `, [roomId]);
      const veto = vetoRows[0];
      if (!veto || veto.completed_at !== null) return { error: "room_not_vetoing" };

      if (Boolean(veto.veto_expired)) {
        await this.reconcileVetoTimeoutLocked(connection, room, veto);
        return { error: "map_veto_window_closed" };
      }

      if (viewerId !== veto.current_vetoer_player_account_id) {
        return { error: "not_map_vetoer" };
      }

      const [entryRows] = await connection.execute<RowDataPacket[]>(`
        SELECT map_key FROM match_map_pool_entries WHERE pool_id = ? ORDER BY position ASC
      `, [veto.pool_id]);
      const poolMapKeys = entryRows.map((r) => r.map_key as string);
      if (!poolMapKeys.includes(mapKey)) return { error: "map_veto_target_not_available" };

      const [actionRows] = await connection.execute<VetoActionRow[]>(`
        SELECT map_key FROM match_room_map_veto_actions WHERE room_id = ?
      `, [roomId]);
      if (actionRows.some((a) => a.map_key === mapKey)) {
        return { error: "map_veto_target_not_available" };
      }

      const nextOrder = Number(veto.next_action_order);

      await connection.execute(`
        INSERT INTO match_room_map_veto_actions (
          room_id, pool_id, action_order, map_key, actor_player_account_id, source
        ) VALUES (?, ?, ?, ?, ?, 'MANUAL_BAN')
      `, [roomId, veto.pool_id, nextOrder, mapKey, viewerId]);

      if (nextOrder < 6) {
        const nextVetoer = viewerId === draft.captain_a_player_account_id
          ? draft.captain_b_player_account_id
          : draft.captain_a_player_account_id;

        await connection.execute(`
          UPDATE match_room_map_vetos
          SET current_vetoer_player_account_id = ?,
              next_action_order = next_action_order + 1,
              action_deadline_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
          WHERE room_id = ?
        `, [nextVetoer, roomId]);
        await connection.execute(`UPDATE match_rooms SET version = version + 1 WHERE id = ?`, [roomId]);
      } else {
        const bannedKeys = new Set([...actionRows.map((a) => a.map_key), mapKey]);
        const lastMapKey = poolMapKeys.find((k) => !bannedKeys.has(k));
        if (!lastMapKey) throw new TypeError("Expected one remaining map for veto completion.");

        await connection.execute(`
          UPDATE match_room_map_vetos
          SET current_vetoer_player_account_id = NULL,
              next_action_order = NULL,
              action_deadline_at = NULL,
              selected_map_key = ?,
              completed_at = UTC_TIMESTAMP(6)
          WHERE room_id = ?
        `, [lastMapKey, roomId]);

        await this.materializeCompetitiveMatchOnConnection(connection, roomId);
        await connection.execute(`UPDATE match_rooms SET status = 'READY', ready_at = UTC_TIMESTAMP(6), version = version + 1 WHERE id = ?`, [roomId]);
      }

      return {};
    });

    if (outcome.retryAfterReconciliation) return this.mapVetoBan(roomId, viewerId, mapKey);
    this.throwOutcome(outcome);
  }

  async getById(roomId: string, viewerId: string): Promise<MatchRoomAggregateSnapshot | null> {
    try { await this.reconcileRoom(roomId); } catch (error) { if (error instanceof MatchRoomError && error.code === "room_not_found") return null; throw error; }
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(this.roomSelect(false), [roomId]); if (!rooms[0]) return null;
      return this.buildSnapshot(connection, rooms[0], viewerId, await this.readViewerContext(connection, viewerId));
    });
  }

  async getCurrent(viewerId: string): Promise<MatchRoomAggregateSnapshot | null> {
    const [active] = await this.databaseService.getPool().execute<IdRow[]>(`SELECT room_id AS id FROM match_room_participants WHERE player_account_id = ? AND released_at IS NULL LIMIT 1`, [viewerId]);
    if (active[0]) await this.reconcileRoom(active[0].id);
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`SELECT r.id, r.creator_player_account_id, r.status, r.version, r.confirmation_round, r.confirmation_started_at, r.confirmation_deadline_at, r.roster_locked_at, r.ready_at, 0 AS confirmation_expired FROM match_room_participants p JOIN match_rooms r ON r.id = p.room_id WHERE p.player_account_id = ? AND p.released_at IS NULL LIMIT 1`, [viewerId]);
      if (!rooms[0]) return null; return this.buildSnapshot(connection, rooms[0], viewerId, await this.readViewerContext(connection, viewerId));
    });
  }

  async listRelevant(viewerId: string): Promise<MatchRoomAggregateSnapshot[]> {
    const [expiredConfirmation] = await this.databaseService.getPool().execute<IdRow[]>(`SELECT id FROM match_rooms WHERE status = 'CONFIRMING' AND confirmation_deadline_at <= UTC_TIMESTAMP(6)`);
    for (const row of expiredConfirmation) await this.reconcileRoom(row.id);
    const [expiredDrafts] = await this.databaseService.getPool().execute<IdRow[]>(`
      SELECT r.id FROM match_rooms r
      JOIN match_room_drafts d ON d.room_id = r.id
      WHERE r.status = 'SETUP' AND d.completed_at IS NULL AND d.pick_deadline_at <= UTC_TIMESTAMP(6)
    `);
    for (const row of expiredDrafts) await this.reconcileRoom(row.id);
    const [expiredVetos] = await this.databaseService.getPool().execute<IdRow[]>(`
      SELECT r.id FROM match_rooms r
      JOIN match_room_map_vetos v ON v.room_id = r.id
      WHERE r.status = 'SETUP' AND v.completed_at IS NULL AND v.action_deadline_at <= UTC_TIMESTAMP(6)
    `);
    for (const row of expiredVetos) await this.reconcileRoom(row.id);
    return this.inReadSnapshot(async (connection) => {
      const [rooms] = await connection.execute<RoomRow[]>(`SELECT DISTINCT r.id, r.creator_player_account_id, r.status, r.version, r.confirmation_round, r.confirmation_started_at, r.confirmation_deadline_at, r.roster_locked_at, r.ready_at, 0 AS confirmation_expired FROM match_rooms r LEFT JOIN match_room_participants p ON p.room_id = r.id AND p.player_account_id = ? AND p.released_at IS NULL WHERE r.status = 'FORMING' OR p.id IS NOT NULL ORDER BY r.created_at ASC, r.id ASC`, [viewerId]);
      const context = await this.readViewerContext(connection, viewerId); return Promise.all(rooms.map((room) => this.buildSnapshot(connection, room, viewerId, context)));
    });
  }

  private async readViewerContext(connection: PoolConnection, viewerId: string) {
    const eligibilityError = await this.getEligibilityError(connection, viewerId);
    const [activeRows] = await connection.execute<ExistsRow[]>(`SELECT EXISTS(SELECT 1 FROM match_room_participants WHERE player_account_id = ? AND released_at IS NULL) AS exists_flag`, [viewerId]);
    return { eligible: eligibilityError === null, hasActiveRoom: Boolean(activeRows[0]?.exists_flag) };
  }

  private async buildSnapshot(connection: PoolConnection, room: RoomRow, viewerId: string, context: { eligible: boolean; hasActiveRoom: boolean }): Promise<MatchRoomAggregateSnapshot> {
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

    let draftSnapshot: MatchRoomDraftSnapshot | null = null;
    let canDraftPick = false;

    let mapVetoSnapshot: MatchRoomMapVetoSnapshot | null = null;
    let canMapVetoBan = false;

    if (room.status === "SETUP" || room.status === "READY" || room.status === "PROVISIONING" || room.status === "CANCELLED") {
      const [draftRows] = await connection.execute<DraftRow[]>(`
        SELECT captain_a_player_account_id, captain_b_player_account_id,
          first_picker_player_account_id, current_picker_player_account_id,
          next_selection_order, pick_deadline_at, completed_at,
          (completed_at IS NULL AND pick_deadline_at <= UTC_TIMESTAMP(6)) AS draft_expired
        FROM match_room_drafts WHERE room_id = ? LIMIT 1
      `, [room.id]);

      if (draftRows[0]) {
        const dRow = draftRows[0];
        const [assignmentRows] = await connection.execute<AssignmentRow[]>(`
          SELECT player_account_id, team, captain, selection_order, source, picker_player_account_id, assigned_at
          FROM match_room_draft_assignments WHERE room_id = ?
          ORDER BY assigned_at ASC, captain DESC, selection_order ASC
        `, [room.id]);

        const assignments: MatchRoomDraftAssignmentSnapshot[] = assignmentRows.map((a) => ({
          playerAccountId: a.player_account_id,
          team: a.team as "A" | "B",
          captain: Boolean(a.captain),
          selectionOrder: a.selection_order === null ? null : Number(a.selection_order),
          source: a.source as MatchRoomDraftAssignmentSource,
          pickerPlayerAccountId: a.picker_player_account_id,
          assignedAt: a.assigned_at,
        }));

        const assignedPlayerIds = new Set(assignments.map((a) => a.playerAccountId));
        const availablePlayerAccountIds = participantSnapshots
          .map((p) => p.playerAccountId)
          .filter((id) => !assignedPlayerIds.has(id));

        const phase: MatchRoomDraftPhase = dRow.completed_at !== null ? "COMPLETED" : "PICKING";

        draftSnapshot = {
          phase,
          captains: {
            teamAPlayerAccountId: dRow.captain_a_player_account_id,
            teamBPlayerAccountId: dRow.captain_b_player_account_id,
          },
          firstPickerPlayerAccountId: dRow.first_picker_player_account_id,
          currentPickerPlayerAccountId: dRow.current_picker_player_account_id,
          nextSelectionOrder: dRow.next_selection_order === null ? null : Number(dRow.next_selection_order),
          pickDeadlineAt: dRow.pick_deadline_at,
          availablePlayerAccountIds,
          assignments,
        };

        const deadlineValid = Boolean(dRow.pick_deadline_at) && !Boolean(dRow.draft_expired);
        canDraftPick =
          viewerParticipant &&
          room.status === "SETUP" &&
          phase === "PICKING" &&
          viewerId === dRow.current_picker_player_account_id &&
          deadlineValid;
      }

      const [vetoRows] = await connection.execute<VetoRow[]>(`
        SELECT room_id, pool_id, first_vetoer_player_account_id,
          current_vetoer_player_account_id, next_action_order,
          action_deadline_at, selected_map_key, completed_at,
          (completed_at IS NULL AND action_deadline_at <= UTC_TIMESTAMP(6)) AS veto_expired
        FROM match_room_map_vetos WHERE room_id = ? LIMIT 1
      `, [room.id]);

      if (vetoRows[0]) {
        const vRow = vetoRows[0];
        const [poolRows] = await connection.execute<RowDataPacket[]>(`
          SELECT id, pool_key, version FROM match_map_pools WHERE id = ? LIMIT 1
        `, [vRow.pool_id]);
        const poolRow = poolRows[0];

        const [poolEntryRows] = await connection.execute<RowDataPacket[]>(`
          SELECT map_key, display_name, position FROM match_map_pool_entries WHERE pool_id = ? ORDER BY position ASC
        `, [vRow.pool_id]);

        const [vetoActionRows] = await connection.execute<VetoActionRow[]>(`
          SELECT action_order, map_key, actor_player_account_id, source, acted_at
          FROM match_room_map_veto_actions WHERE room_id = ?
          ORDER BY action_order ASC
        `, [room.id]);

        const actions: MatchRoomMapVetoActionSnapshot[] = vetoActionRows.map((a) => ({
          actionOrder: Number(a.action_order),
          mapKey: a.map_key,
          actorPlayerAccountId: a.actor_player_account_id,
          source: a.source as MatchRoomMapVetoActionSource,
          actedAt: a.acted_at,
        }));

        const bannedMapKeys = new Set(actions.map((a) => a.mapKey));
        const phase: MatchRoomMapVetoPhase = vRow.completed_at !== null ? "COMPLETED" : "BANNING";

        let availableMapKeys: string[];
        if (phase === "COMPLETED") {
          availableMapKeys = vRow.selected_map_key ? [vRow.selected_map_key] : [];
        } else {
          availableMapKeys = poolEntryRows
            .map((e) => e.map_key as string)
            .filter((k) => !bannedMapKeys.has(k));
        }

        mapVetoSnapshot = {
          phase,
          pool: {
            id: poolRow ? poolRow.id : vRow.pool_id,
            key: poolRow ? poolRow.pool_key : MIX_5V5_MAP_POOL_KEY,
            version: poolRow ? Number(poolRow.version) : 1,
            maps: poolEntryRows.map((e) => ({
              key: e.map_key as string,
              displayName: e.display_name as string,
              position: Number(e.position),
            })),
          },
          firstVetoerPlayerAccountId: vRow.first_vetoer_player_account_id,
          currentVetoerPlayerAccountId: vRow.current_vetoer_player_account_id,
          nextActionOrder: vRow.next_action_order === null ? null : Number(vRow.next_action_order),
          actionDeadlineAt: vRow.action_deadline_at,
          availableMapKeys,
          selectedMapKey: vRow.selected_map_key,
          actions,
        };

        const vetoDeadlineValid = Boolean(vRow.action_deadline_at) && !Boolean(vRow.veto_expired);
        canMapVetoBan =
          viewerParticipant &&
          room.status === "SETUP" &&
          draftSnapshot?.phase === "COMPLETED" &&
          phase === "BANNING" &&
          viewerId === vRow.current_vetoer_player_account_id &&
          vetoDeadlineValid;
      }
    }

    const competitiveMatchSnapshot = await this.competitiveMatchRepository.findByRoomIdOnConnection(connection, room.id);

    return {
      room: { id: room.id, status: room.status, version: Number(room.version), creator: { playerAccountId: room.creator_player_account_id }, participantCount: participants.length, capacity: MATCH_ROOM_CAPACITY,
        confirmation: confirming && room.confirmation_started_at && room.confirmation_deadline_at ? { round, startedAt: room.confirmation_started_at, deadlineAt: room.confirmation_deadline_at, confirmedCount } : null,
        rosterLockedAt: room.roster_locked_at, readyAt: room.ready_at, draft: draftSnapshot, mapVeto: mapVetoSnapshot, competitiveMatch: competitiveMatchSnapshot, participants: participantSnapshots },
      viewer: { participant: viewerParticipant, creator: viewerCreator, actions: {
        canJoin: forming && context.eligible && !context.hasActiveRoom && participants.length < MATCH_ROOM_CAPACITY,
        canLeave: forming && viewerParticipant && !viewerCreator,
        canCancel: viewerCreator && (["FORMING", "CONFIRMING", "SETUP"] as MatchRoomStatus[]).includes(room.status),
        canConfirm: confirming && viewerParticipant && !viewer?.confirmation.confirmed,
        canDraftPick,
        canMapVetoBan,
      } },
    };
  }
}
