import { Injectable } from "@nestjs/common";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import { MatchIngressError } from "./match-ingress-error.js";

export interface MatchIngressRow extends RowDataPacket {
  id: number;
  source_key: string;
  edge_event_id: string;
  edge_sequence: number | string | bigint;
  event_name: string;
  local_matchid: number | string | bigint | null;
  edge_received_at: Date | string;
  payload_json: string;
  payload_sha256: string;
  ingested_at: Date | string;
}

export interface MatchIngressRecord {
  sourceKey: string;
  edgeEventId: string;
  edgeSequence: bigint;
  eventName: string;
  localMatchId: bigint | null;
  edgeReceivedAt: string;
  payloadJsonText: string;
  payloadSha256: string;
}

export interface SeriesEndMatchContextRow extends RowDataPacket {
  competitive_match_id: string;
  runtime_match_id: string | number;
  room_id: string;
  room_status: string;
  room_version: string | number;
  room_completed_at: Date | string | null;
  assignment_id: string | null;
  assignment_server_key: string | null;
  assignment_released_at: Date | string | null;
  assignment_release_reason: string | null;
  resource_server_key: string | null;
  match_edge_source_key: string | null;
}

function normalizeIsoUtc(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function areFieldsIdentical(
  record: MatchIngressRecord,
  row: MatchIngressRow,
): boolean {
  if (BigInt(record.edgeSequence) !== BigInt(row.edge_sequence)) {
    return false;
  }
  if (record.eventName !== row.event_name) {
    return false;
  }
  const recordLocalMatch = record.localMatchId === null ? null : BigInt(record.localMatchId);
  const rowLocalMatch = row.local_matchid === null ? null : BigInt(row.local_matchid);
  if (recordLocalMatch !== rowLocalMatch) {
    return false;
  }
  if (normalizeIsoUtc(record.edgeReceivedAt) !== normalizeIsoUtc(row.edge_received_at)) {
    return false;
  }
  if (record.payloadSha256 !== row.payload_sha256) {
    return false;
  }
  if (record.payloadJsonText !== row.payload_json) {
    return false;
  }
  return true;
}

@Injectable()
export class MatchIngressRepository {
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
        try {
          await connection.rollback();
        } catch {}
        throw error;
      }
    } finally {
      connection.release();
    }
  }

  async findBySourceAndEdgeEventId(
    sourceKey: string,
    edgeEventId: string,
    connection?: PoolConnection,
    lock = false,
  ): Promise<MatchIngressRow | null> {
    const executor = connection ?? this.databaseService.getPool();
    const [rows] = await executor.execute<MatchIngressRow[]>(
      `
        SELECT
          id,
          source_key,
          edge_event_id,
          edge_sequence,
          event_name,
          local_matchid,
          edge_received_at,
          payload_json,
          payload_sha256,
          ingested_at
        FROM match_ingress_events
        WHERE source_key = ? AND edge_event_id = ?
        LIMIT 1${lock ? " FOR UPDATE" : ""}
      `,
      [sourceKey, edgeEventId],
    );
    return rows[0] ?? null;
  }

  private async persistIngressRecord(
    record: MatchIngressRecord,
    connection?: PoolConnection,
  ): Promise<boolean> {
    const existingRow = await this.findBySourceAndEdgeEventId(
      record.sourceKey,
      record.edgeEventId,
      connection,
    );

    if (existingRow) {
      if (areFieldsIdentical(record, existingRow)) {
        return true;
      }
      throw new MatchIngressError(409, "idempotency_conflict");
    }

    const executor = connection ?? this.databaseService.getPool();
    const dbFormattedDate = record.edgeReceivedAt.replace("T", " ").replace("Z", "");

    try {
      await executor.execute<ResultSetHeader>(
        `
          INSERT INTO match_ingress_events (
            source_key,
            edge_event_id,
            edge_sequence,
            event_name,
            local_matchid,
            edge_received_at,
            payload_json,
            payload_sha256
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.sourceKey,
          record.edgeEventId,
          record.edgeSequence.toString(),
          record.eventName,
          record.localMatchId === null ? null : record.localMatchId.toString(),
          dbFormattedDate,
          record.payloadJsonText,
          record.payloadSha256,
        ],
      );
      return false;
    } catch (error: any) {
      if (error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062)) {
        const reFetched = await this.findBySourceAndEdgeEventId(
          record.sourceKey,
          record.edgeEventId,
          connection,
          Boolean(connection),
        );
        if (reFetched && areFieldsIdentical(record, reFetched)) {
          return true;
        }
        throw new MatchIngressError(409, "idempotency_conflict");
      }
      throw error;
    }
  }

  private async saveAndProjectSeriesEnd(record: MatchIngressRecord): Promise<{ duplicate: boolean }> {
    return this.inTransaction(async (connection) => {
      const duplicate = await this.persistIngressRecord(record, connection);

      if (record.localMatchId === null) {
        throw new MatchIngressError(400, "missing_local_match_id");
      }

      const [rows] = await connection.execute<SeriesEndMatchContextRow[]>(
        `
          SELECT
            cm.id AS competitive_match_id,
            cm.runtime_match_id,
            cm.room_id,
            mr.status AS room_status,
            mr.version AS room_version,
            mr.completed_at AS room_completed_at,
            msa.id AS assignment_id,
            msa.server_key AS assignment_server_key,
            msa.released_at AS assignment_released_at,
            msa.release_reason AS assignment_release_reason,
            msr.server_key AS resource_server_key,
            msr.match_edge_source_key
          FROM competitive_matches cm
          JOIN match_rooms mr ON mr.id = cm.room_id
          LEFT JOIN match_server_assignments msa ON msa.competitive_match_id = cm.id
          LEFT JOIN match_server_resources msr ON msr.server_key = msa.server_key
          WHERE cm.runtime_match_id = ?
          ORDER BY msa.assigned_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [record.localMatchId.toString()],
      );

      const matchCtx = rows[0];
      if (!matchCtx) {
        throw new MatchIngressError(404, "runtime_match_not_found");
      }

      if (
        !matchCtx.assignment_id ||
        !matchCtx.resource_server_key ||
        !matchCtx.match_edge_source_key
      ) {
        throw new MatchIngressError(409, "assignment_not_found");
      }

      if (matchCtx.match_edge_source_key !== record.sourceKey) {
        throw new MatchIngressError(403, "source_key_mismatch");
      }

      if (matchCtx.room_status === "COMPLETED") {
        return { duplicate };
      }

      if (matchCtx.room_status === "JOINABLE") {
        if (matchCtx.assignment_released_at !== null) {
          throw new MatchIngressError(409, "assignment_already_released");
        }

        const [roomResult] = await connection.execute<ResultSetHeader>(
          `
            UPDATE match_rooms
            SET
              status = 'COMPLETED',
              completed_at = UTC_TIMESTAMP(6),
              version = version + 1
            WHERE id = ? AND status = 'JOINABLE'
          `,
          [matchCtx.room_id],
        );

        if (roomResult.affectedRows !== 1) {
          throw new MatchIngressError(409, "failed_to_complete_room");
        }

        await connection.execute<ResultSetHeader>(
          `
            UPDATE match_room_participants
            SET
              released_at = UTC_TIMESTAMP(6),
              release_reason = 'MATCH_COMPLETED'
            WHERE room_id = ? AND released_at IS NULL
          `,
          [matchCtx.room_id],
        );

        const [assignmentResult] = await connection.execute<ResultSetHeader>(
          `
            UPDATE match_server_assignments
            SET
              released_at = UTC_TIMESTAMP(6),
              release_reason = 'MATCH_COMPLETED'
            WHERE id = ?
              AND competitive_match_id = ?
              AND released_at IS NULL
          `,
          [matchCtx.assignment_id, matchCtx.competitive_match_id],
        );

        if (assignmentResult.affectedRows !== 1) {
          throw new MatchIngressError(409, "failed_to_release_assignment");
        }

        return { duplicate };
      }

      throw new MatchIngressError(409, "invalid_room_lifecycle");
    });
  }

  async saveEvent(record: MatchIngressRecord): Promise<{ duplicate: boolean }> {
    if (record.eventName === "series_end") {
      return this.saveAndProjectSeriesEnd(record);
    }
    const duplicate = await this.persistIngressRecord(record);
    return { duplicate };
  }
}
