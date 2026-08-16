import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
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

  async findBySourceAndEdgeEventId(
    sourceKey: string,
    edgeEventId: string,
  ): Promise<MatchIngressRow | null> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<MatchIngressRow[]>(
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
        LIMIT 1
      `,
      [sourceKey, edgeEventId],
    );
    return rows[0] ?? null;
  }

  async saveEvent(record: MatchIngressRecord): Promise<{ duplicate: boolean }> {
    const existingRow = await this.findBySourceAndEdgeEventId(
      record.sourceKey,
      record.edgeEventId,
    );

    if (existingRow) {
      if (areFieldsIdentical(record, existingRow)) {
        return { duplicate: true };
      }
      throw new MatchIngressError(409, "idempotency_conflict");
    }

    const pool = this.databaseService.getPool();
    const dbFormattedDate = record.edgeReceivedAt.replace("T", " ").replace("Z", "");

    try {
      await pool.execute<ResultSetHeader>(
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
      return { duplicate: false };
    } catch (error: any) {
      if (error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062)) {
        const reFetched = await this.findBySourceAndEdgeEventId(
          record.sourceKey,
          record.edgeEventId,
        );
        if (reFetched && areFieldsIdentical(record, reFetched)) {
          return { duplicate: true };
        }
        throw new MatchIngressError(409, "idempotency_conflict");
      }
      throw error;
    }
  }
}
