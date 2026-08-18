import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import type { RawMatchMapPool } from "./match-map-pool.contract.js";

interface PoolRow extends RowDataPacket {
  id: string;
  pool_key: string;
  version: number | string;
  status: string;
}

interface EntryRow extends RowDataPacket {
  map_key: string;
  display_name: string;
  position: number | string;
}

@Injectable()
export class MatchMapPoolRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findActivePool(poolKey: string): Promise<RawMatchMapPool | null> {
    const pool = this.databaseService.getPool();

    const [poolRows] = await pool.execute<PoolRow[]>(
      `SELECT id, pool_key, version, status
       FROM match_map_pools
       WHERE pool_key = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [poolKey],
    );

    const poolRow = poolRows[0];
    if (!poolRow) {
      return null;
    }

    const [entryRows] = await pool.execute<EntryRow[]>(
      `SELECT map_key, display_name, position
       FROM match_map_pool_entries
       WHERE pool_id = ?
       ORDER BY position ASC`,
      [poolRow.id],
    );

    return {
      id: poolRow.id,
      key: poolRow.pool_key,
      version: Number(poolRow.version),
      status: poolRow.status,
      maps: entryRows.map((row) => ({
        key: row.map_key,
        displayName: row.display_name,
        position: Number(row.position),
      })),
    };
  }
}
