import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

export interface UsableMagicLink {
  magicLinkId: number;
  userId: number;
  expiresAt: Date | string;
  email: string | null;
  name: string | null;
  role: string | null;
}

interface RawMagicLinkRow extends RowDataPacket {
  id: number;
  user_id: number;
  expires_at: Date | string;
  email: string | null;
  display_name: string | null;
  role: string | null;
}

@Injectable()
export class AdminMagicLinkRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findUsableMagicLinkByToken(
    rawToken: string,
  ): Promise<UsableMagicLink | null> {
    if (!rawToken || typeof rawToken !== "string") {
      return null;
    }

    const tokenHash = createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex");
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawMagicLinkRow[]>(
      `
        SELECT
          ml.id,
          ml.user_id,
          ml.expires_at,
          u.email,
          u.display_name,
          u.role
        FROM magic_links ml
        INNER JOIN users u
          ON u.id = ml.user_id
        WHERE ml.token_hash = ?
          AND ml.used_at IS NULL
          AND ml.expires_at > UTC_TIMESTAMP()
        LIMIT 1
      `,
      [tokenHash],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      magicLinkId: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      email: row.email,
      name: row.display_name,
      role: row.role,
    };
  }

  async markMagicLinkAsUsed(magicLinkId: number): Promise<void> {
    if (!Number.isInteger(magicLinkId) || magicLinkId <= 0) {
      throw new Error("invalid_magic_link_id");
    }

    const pool = this.databaseService.getPool();

    await pool.execute<ResultSetHeader>(
      `
        UPDATE magic_links
        SET used_at = UTC_TIMESTAMP()
        WHERE id = ?
      `,
      [magicLinkId],
    );
  }
}
