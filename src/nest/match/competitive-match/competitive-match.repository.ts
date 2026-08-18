import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import type {
  CompetitiveMatchSnapshot,
  CreateCompetitiveMatchInput,
} from "./competitive-match.contract.js";
import { validateCompetitiveMatchRuntimeSnapshot } from "./competitive-match.invariants.js";

interface CompetitiveMatchRow extends RowDataPacket {
  id: string;
  room_id: string;
  runtime_match_id: string | number;
  map_pool_id: string;
  map_pool_key: string;
  map_pool_version: string | number;
  map_key: string;
  map_display_name: string;
  created_at: Date | string;
}

interface CompetitiveMatchRosterRow extends RowDataPacket {
  competitive_match_id: string;
  player_account_id: string;
  steamid64: string;
  team: string;
  created_at: Date | string;
}

@Injectable()
export class CompetitiveMatchRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createOnConnection(
    connection: PoolConnection,
    input: CreateCompetitiveMatchInput,
  ): Promise<CompetitiveMatchSnapshot> {
    const id = input.id ?? randomUUID();

    await connection.execute(
      `INSERT INTO competitive_matches (
        id, room_id, map_pool_id, map_pool_key, map_pool_version, map_key, map_display_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.roomId,
        input.map.poolId,
        input.map.poolKey,
        input.map.poolVersion,
        input.map.key,
        input.map.displayName,
      ],
    );

    for (const entry of input.roster) {
      await connection.execute(
        `INSERT INTO competitive_match_roster (
          competitive_match_id, player_account_id, steamid64, team
        ) VALUES (?, ?, ?, ?)`,
        [id, entry.playerAccountId, entry.steamid64, entry.team],
      );
    }

    const [rows] = await connection.execute<CompetitiveMatchRow[]>(
      `SELECT id, room_id, runtime_match_id, map_pool_id, map_pool_key, map_pool_version, map_key, map_display_name, created_at
       FROM competitive_matches WHERE id = ? LIMIT 1`,
      [id],
    );

    const row = rows[0];
    if (!row) {
      throw new TypeError("Failed to read created competitive match.");
    }

    return validateCompetitiveMatchRuntimeSnapshot({
      id: row.id,
      runtimeMatchId: row.runtime_match_id,
      map: {
        poolId: row.map_pool_id,
        poolKey: row.map_pool_key,
        poolVersion: Number(row.map_pool_version),
        key: row.map_key,
        displayName: row.map_display_name,
      },
      roster: input.roster,
    });
  }

  async findByRoomIdOnConnection(
    connection: PoolConnection | mysql.Pool,
    roomId: string,
  ): Promise<CompetitiveMatchSnapshot | null> {
    const [rows] = await connection.execute<CompetitiveMatchRow[]>(
      `SELECT id, room_id, runtime_match_id, map_pool_id, map_pool_key, map_pool_version, map_key, map_display_name, created_at
       FROM competitive_matches WHERE room_id = ? LIMIT 1`,
      [roomId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const [rosterRows] = await connection.execute<CompetitiveMatchRosterRow[]>(
      `SELECT competitive_match_id, player_account_id, steamid64, team, created_at
       FROM competitive_match_roster WHERE competitive_match_id = ?
       ORDER BY team ASC, player_account_id ASC`,
      [row.id],
    );

    return validateCompetitiveMatchRuntimeSnapshot({
      id: row.id,
      runtimeMatchId: row.runtime_match_id,
      map: {
        poolId: row.map_pool_id,
        poolKey: row.map_pool_key,
        poolVersion: Number(row.map_pool_version),
        key: row.map_key,
        displayName: row.map_display_name,
      },
      roster: rosterRows.map((r) => ({
        playerAccountId: r.player_account_id,
        steamid64: r.steamid64,
        team: r.team as "A" | "B",
      })),
    });
  }

  async findByRoomId(roomId: string): Promise<CompetitiveMatchSnapshot | null> {
    return this.findByRoomIdOnConnection(
      this.databaseService.getPool(),
      roomId,
    );
  }
}
