import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import { createPlayerSessionTokenMaterial } from "./player-session-token.js";

export interface PlayerSession {
  sessionId: string;
  playerAccountId: string;
  steamid64: string | null;
  displayName: string | null;
  avatarMedium: string | null;
  steamProfileUrl: string | null;
  expiresAt: Date | string;
}

export interface CreatedPlayerSession {
  sessionId: string;
  rawToken: string;
}

interface RawPlayerSessionRow extends RowDataPacket {
  session_id: string;
  player_account_id: string;
  expires_at: Date | string;
  display_name: string | null;
  steamid64: string | null;
  personaname: string | null;
  avatar_medium_url: string | null;
  profile_url: string | null;
}

@Injectable()
export class PlayerSessionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findActivePlayerSessionByToken(
    rawToken: string,
  ): Promise<PlayerSession | null> {
    if (!rawToken || typeof rawToken !== "string") {
      return null;
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawPlayerSessionRow[]>(
      `
        SELECT
          s.id AS session_id,
          s.player_account_id,
          s.expires_at,
          a.display_name,
          i.steamid64,
          sp.personaname,
          sp.avatar_medium_url,
          sp.profile_url
        FROM player_sessions s
        INNER JOIN player_accounts a
          ON a.id = s.player_account_id
        LEFT JOIN player_steam_identities i
          ON i.player_account_id = a.id
        LEFT JOIN steam_profiles sp
          ON sp.steamid64 = i.steamid64
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > UTC_TIMESTAMP()
          AND a.status = 'active'
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
      playerAccountId: row.player_account_id,
      steamid64: row.steamid64 ?? null,
      displayName: row.personaname ?? row.display_name ?? null,
      avatarMedium: row.avatar_medium_url ?? null,
      steamProfileUrl: row.profile_url ?? null,
      expiresAt: row.expires_at,
    };
  }

  async createPlayerSessionForAccount(
    playerAccountId: string,
    ttlHours: number,
  ): Promise<CreatedPlayerSession> {
    const {
      sessionId,
      rawToken,
      tokenHash,
    } = createPlayerSessionTokenMaterial();
    const pool = this.databaseService.getPool();

    await pool.execute<ResultSetHeader>(
      `
        INSERT INTO player_sessions (
          id,
          player_account_id,
          token_hash,
          expires_at,
          revoked_at
        )
        VALUES (
          ?,
          ?,
          ?,
          DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR),
          NULL
        )
      `,
      [sessionId, playerAccountId, tokenHash, ttlHours],
    );

    return {
      sessionId,
      rawToken,
    };
  }

  async revokePlayerSessionByToken(rawToken: string): Promise<boolean> {
    if (!rawToken || typeof rawToken !== "string") {
      return false;
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const pool = this.databaseService.getPool();

    const [result] = await pool.execute<ResultSetHeader>(
      `
        UPDATE player_sessions
        SET revoked_at = UTC_TIMESTAMP()
        WHERE token_hash = ?
          AND revoked_at IS NULL
      `,
      [tokenHash],
    );

    return result.affectedRows > 0;
  }
}
