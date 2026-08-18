import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import { RUNTIME_MATCH_ID_START } from "../competitive-match/competitive-match.contract.js";
import type { ServerProvisioningAssignment } from "./server-assignment.contract.js";

interface ServerResourceRow extends RowDataPacket {
  server_key: string;
  bridge_node_key: string;
  match_edge_source_key: string;
  enabled: number;
}

interface ActiveAssignmentRow extends RowDataPacket {
  server_key: string;
}

interface ReadyRoomRow extends RowDataPacket {
  id: string;
  status: string;
  version: string | number;
  ready_at: Date | string | null;
}

interface CompetitiveMatchRow extends RowDataPacket {
  id: string;
  room_id: string;
  runtime_match_id: string | number;
}

interface AssignmentTimestampRow extends RowDataPacket {
  assigned_at: Date | string;
}

@Injectable()
export class ServerAssignmentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async assignNextReadyForBridgeNode(
    bridgeNodeKey: string,
  ): Promise<ServerProvisioningAssignment | null> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.beginTransaction();

      // 1. Lock eligible enabled ServerResource rows for bridgeNodeKey in deterministic order
      const [resourceRows] = await connection.execute<ServerResourceRow[]>(
        `SELECT server_key, bridge_node_key, match_edge_source_key, enabled
         FROM match_server_resources
         WHERE bridge_node_key = ? AND enabled = 1
         ORDER BY server_key ASC
         FOR UPDATE`,
        [bridgeNodeKey],
      );

      if (resourceRows.length === 0) {
        await connection.commit();
        return null;
      }

      // 2. Determine first free resource with no active assignment
      const serverKeys = resourceRows.map((r) => r.server_key);
      const placeholders = serverKeys.map(() => "?").join(", ");
      const [activeAssignmentRows] = await connection.query<ActiveAssignmentRow[]>(
        `SELECT server_key
         FROM match_server_assignments
         WHERE active_server_key IS NOT NULL
           AND server_key IN (${placeholders})`,
        serverKeys,
      );

      const activeServerKeys = new Set(activeAssignmentRows.map((a) => a.server_key));
      const selectedResource = resourceRows.find(
        (r) => !activeServerKeys.has(r.server_key),
      );

      if (!selectedResource) {
        await connection.commit();
        return null;
      }

      // 3. Lock oldest READY MatchRoom using authoritative FIFO (ready_at ASC, id ASC)
      // Corrupt rooms (status = READY with ready_at IS NULL) are ordered first to fail fast
      const [readyRooms] = await connection.execute<ReadyRoomRow[]>(
        `SELECT id, status, version, ready_at
         FROM match_rooms
         WHERE status = 'READY'
         ORDER BY
           CASE WHEN ready_at IS NULL THEN 0 ELSE 1 END ASC,
           ready_at ASC,
           id ASC
         LIMIT 1
         FOR UPDATE`,
      );

      const room = readyRooms[0];
      if (!room) {
        await connection.commit();
        return null;
      }

      if (room.status !== "READY" || room.ready_at === null) {
        throw new TypeError("Corrupt match room state encountered during server allocation.");
      }

      // 4. Load & revalidate CompetitiveMatch for the locked room
      const [matchRows] = await connection.execute<CompetitiveMatchRow[]>(
        `SELECT id, room_id, runtime_match_id
         FROM competitive_matches
         WHERE room_id = ?
         LIMIT 1
         FOR UPDATE`,
        [room.id],
      );

      const match = matchRows[0];
      if (!match) {
        throw new TypeError("Competitive match not found for ready match room.");
      }

      const runtimeMatchId = Number(match.runtime_match_id);
      if (!Number.isSafeInteger(runtimeMatchId) || runtimeMatchId < RUNTIME_MATCH_ID_START) {
        throw new TypeError("Invalid runtimeMatchId for competitive match.");
      }

      // 5. Revalidate assignment absence for CompetitiveMatch
      const [existingActiveAssignments] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM match_server_assignments
         WHERE active_competitive_match_id = ?
         LIMIT 1`,
        [match.id],
      );

      if (existingActiveAssignments.length > 0) {
        throw new TypeError("Active assignment already exists for competitive match.");
      }

      // 6. INSERT ServerAssignment
      const assignmentId = randomUUID();
      await connection.execute(
        `INSERT INTO match_server_assignments (
           id, competitive_match_id, server_key, assigned_at
         ) VALUES (?, ?, ?, UTC_TIMESTAMP(6))`,
        [assignmentId, match.id, selectedResource.server_key],
      );

      // 7. INSERT PREPARE_MATCH command
      const commandId = randomUUID();
      await connection.execute(
        `INSERT INTO match_server_commands (
           id, assignment_id, bridge_node_key, command_type, runtime_match_id, created_at
         ) VALUES (?, ?, ?, 'PREPARE_MATCH', ?, UTC_TIMESTAMP(6))`,
        [commandId, assignmentId, selectedResource.bridge_node_key, runtimeMatchId],
      );

      // 8. UPDATE MatchRoom READY -> PROVISIONING (version + 1)
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE match_rooms
         SET status = 'PROVISIONING', version = version + 1
         WHERE id = ? AND status = 'READY'`,
        [room.id],
      );

      if (updateResult.affectedRows !== 1) {
        throw new TypeError("Failed to transition match room to PROVISIONING.");
      }

      // 9. Read the persisted assigned_at timestamp directly from database
      const [assignmentTimestampRows] = await connection.execute<AssignmentTimestampRow[]>(
        `SELECT assigned_at
         FROM match_server_assignments
         WHERE id = ?
         LIMIT 1`,
        [assignmentId],
      );

      const persistedAssignment = assignmentTimestampRows[0];
      if (!persistedAssignment) {
        throw new TypeError("Failed to read persisted assignment timestamp.");
      }

      await connection.commit();

      return {
        assignmentId,
        commandId,
        competitiveMatchId: match.id,
        runtimeMatchId,
        serverKey: selectedResource.server_key,
        bridgeNodeKey: selectedResource.bridge_node_key,
        matchEdgeSourceKey: selectedResource.match_edge_source_key,
        assignedAt: persistedAssignment.assigned_at,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
