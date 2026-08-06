import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

export interface AdminSession {
  sessionId: string;
  userId: number;
  expiresAt: Date | string;
  email: string | null;
  name: string | null;
  role: string | null;
}

interface RawSessionRow extends RowDataPacket {
  session_id: string;
  user_id: number;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  email: string | null;
  display_name: string | null;
  role: string | null;
}

@Injectable()
export class AdminSessionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findActiveSessionByToken(
    rawToken: string,
  ): Promise<AdminSession | null> {
    if (!rawToken || typeof rawToken !== "string") {
      return null;
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawSessionRow[]>(
      `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.expires_at,
          s.revoked_at,
          u.email,
          u.display_name,
          u.role
        FROM sessions s
        INNER JOIN users u
          ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > UTC_TIMESTAMP()
        LIMIT 1
      `,
      [tokenHash],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      email: row.email,
      name: row.display_name,
      role: row.role,
    };
  }
}
