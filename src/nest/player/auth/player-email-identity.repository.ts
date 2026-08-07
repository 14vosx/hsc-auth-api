import { Injectable } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

export interface CreatedPendingEmailRegistration {
  created: true;
  playerAccountId: string;
  playerEmailIdentityId: string;
  rawVerificationToken: string;
  verificationExpiresAt: string;
}

export interface ExistingEmailRegistration {
  created: false;
}

export type PendingEmailRegistrationResult =
  | CreatedPendingEmailRegistration
  | ExistingEmailRegistration;

interface ExistingEmailIdentityRow extends RowDataPacket {
  id: string;
}

function formatUtcDatetime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

function isDuplicateEntryError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

@Injectable()
export class PlayerEmailIdentityRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createPendingRegistration(input: {
    email: string;
    passwordHash: string;
    displayName: string | null;
    verificationTtlMinutes: number;
  }): Promise<PendingEmailRegistrationResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const playerAccountId = randomUUID();
        const playerEmailIdentityId = randomUUID();
        const verificationTokenId = randomUUID();

        const rawVerificationToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256")
          .update(rawVerificationToken, "utf8")
          .digest("hex");

        const expiresAtDate = new Date(
          Date.now() + input.verificationTtlMinutes * 60 * 1000,
        );
        const verificationExpiresAt =
          formatUtcDatetime(expiresAtDate);

        await connection.execute(
          `
            INSERT INTO player_accounts (
              id,
              status,
              display_name
            )
            VALUES (
              ?,
              'active',
              ?
            )
          `,
          [playerAccountId, input.displayName],
        );

        await connection.execute(
          `
            INSERT INTO player_email_identities (
              id,
              player_account_id,
              email,
              password_hash
            )
            VALUES (?, ?, ?, ?)
          `,
          [
            playerEmailIdentityId,
            playerAccountId,
            input.email,
            input.passwordHash,
          ],
        );

        await connection.execute(
          `
            INSERT INTO player_email_verification_tokens (
              id,
              player_email_identity_id,
              token_hash,
              expires_at,
              used_at
            )
            VALUES (?, ?, ?, ?, NULL)
          `,
          [
            verificationTokenId,
            playerEmailIdentityId,
            tokenHash,
            verificationExpiresAt,
          ],
        );

        await connection.commit();

        return {
          created: true,
          playerAccountId,
          playerEmailIdentityId,
          rawVerificationToken,
          verificationExpiresAt,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}

        if (isDuplicateEntryError(error)) {
          const [existingRows] =
            await connection.execute<ExistingEmailIdentityRow[]>(
              `
                SELECT id
                FROM player_email_identities
                WHERE email = ?
                LIMIT 1
              `,
              [input.email],
            );

          if (existingRows[0]) {
            return { created: false };
          }
        }

        throw error;
      }
    } finally {
      connection.release();
    }
  }
}
