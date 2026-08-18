import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import {
  LEASE_DURATION_SECONDS,
  type ClaimedCommandPayload,
  type SubmitResultRequestBody,
} from "./match-bridge.contract.js";
import {
  buildAndValidateMatchSpecV1,
  canonicalizeJson,
} from "./match-bridge.invariants.js";

interface BridgeNodeRow extends RowDataPacket {
  bridge_node_key: string;
}

interface ClaimCandidateRow extends RowDataPacket {
  id: string;
  assignment_id: string;
  bridge_node_key: string;
  command_type: string;
  runtime_match_id: string | number;
  server_key: string;
  competitive_match_id: string;
  map_pool_key: string;
  map_pool_version: string | number;
  map_key: string;
  map_display_name: string;
}

interface LeaseTimestampRow extends RowDataPacket {
  lease_expires_at: Date | string;
  attempt_count: string | number;
}

interface RosterRow extends RowDataPacket {
  player_account_id: string;
  steamid64: string;
  team: string;
}

interface CommandStatusRow extends RowDataPacket {
  id: string;
  bridge_node_key: string;
  command_type: string;
  status: string;
  lease_token_digest: string | null;
  lease_expires_at: Date | string | null;
  result_code: string | null;
  result_json: string | null;
  is_lease_active: number;
}

export class MatchBridgeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly errorCode: string = "bad_request",
  ) {
    super(message);
    this.name = "MatchBridgeError";
  }
}

@Injectable()
export class MatchBridgeRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async authenticateBridgeNode(rawKey: string): Promise<string | null> {
    if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
      return null;
    }

    const credentialDigest = createHash("sha256").update(rawKey).digest("hex");

    const [rows] = await this.databaseService.getPool().execute<BridgeNodeRow[]>(
      `SELECT bridge_node_key
       FROM match_bridge_nodes
       WHERE credential_digest = ? AND enabled = 1
       LIMIT 1`,
      [credentialDigest],
    );

    const node = rows[0];
    return node ? node.bridge_node_key : null;
  }

  async touchHeartbeat(bridgeNodeKey: string): Promise<void> {
    await this.databaseService.getPool().execute(
      `UPDATE match_bridge_nodes
       SET last_seen_at = UTC_TIMESTAMP(6)
       WHERE bridge_node_key = ?`,
      [bridgeNodeKey],
    );
  }

  async claimNextCommand(bridgeNodeKey: string): Promise<ClaimedCommandPayload | null> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.beginTransaction();

      // 1. Find and lock oldest eligible command (FIFO: created_at ASC, id ASC)
      const [candidates] = await connection.execute<ClaimCandidateRow[]>(
        `SELECT
           c.id,
           c.assignment_id,
           c.bridge_node_key,
           c.command_type,
           c.runtime_match_id,
           a.server_key,
           a.competitive_match_id,
           cm.map_pool_key,
           cm.map_pool_version,
           cm.map_key,
           cm.map_display_name
         FROM match_server_commands c
         JOIN match_server_assignments a ON a.id = c.assignment_id
         JOIN competitive_matches cm ON cm.id = a.competitive_match_id
         WHERE c.bridge_node_key = ?
           AND (c.status = 'PENDING' OR (c.status = 'CLAIMED' AND c.lease_expires_at <= UTC_TIMESTAMP(6)))
         ORDER BY c.created_at ASC, c.id ASC
         LIMIT 1
         FOR UPDATE`,
        [bridgeNodeKey],
      );

      const commandRow = candidates[0];
      if (!commandRow) {
        await connection.commit();
        return null;
      }

      if (commandRow.command_type !== "PREPARE_MATCH") {
        throw new TypeError(
          `Unsupported command_type encountered during claim: '${commandRow.command_type}'`
        );
      }

      // 2. Generate crypto random raw lease token and its SHA-256 digest
      const rawLeaseToken = randomBytes(32).toString("hex");
      const leaseTokenDigest = createHash("sha256").update(rawLeaseToken).digest("hex");

      // 3. Atomically update command to CLAIMED with 30s lease
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE match_server_commands
         SET
           status = 'CLAIMED',
           lease_token_digest = ?,
           lease_expires_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${LEASE_DURATION_SECONDS} SECOND),
           attempt_count = attempt_count + 1
         WHERE id = ?`,
        [leaseTokenDigest, commandRow.id],
      );

      if (updateResult.affectedRows !== 1) {
        throw new TypeError("Failed to acquire command lease during claim.");
      }

      // 4. Read persisted lease expiry and attempt count from database
      const [leaseRows] = await connection.execute<LeaseTimestampRow[]>(
        `SELECT lease_expires_at, attempt_count
         FROM match_server_commands
         WHERE id = ?
         LIMIT 1`,
        [commandRow.id],
      );

      const leaseInfo = leaseRows[0];
      if (!leaseInfo) {
        throw new TypeError("Failed to read persisted lease information.");
      }

      // 5. Load roster for authoritative Match Spec v1 construction
      const [rosterRows] = await connection.execute<RosterRow[]>(
        `SELECT player_account_id, steamid64, team
         FROM competitive_match_roster
         WHERE competitive_match_id = ?
         ORDER BY team ASC, created_at ASC`,
        [commandRow.competitive_match_id],
      );

      const runtimeMatchId = Number(commandRow.runtime_match_id);
      const mapPoolVersion = Number(commandRow.map_pool_version);

      // Validate all Match Spec v1 invariants within the same transaction
      const matchSpec = buildAndValidateMatchSpecV1({
        competitiveMatchId: commandRow.competitive_match_id,
        runtimeMatchId,
        mapPoolKey: commandRow.map_pool_key,
        mapPoolVersion,
        mapKey: commandRow.map_key,
        mapDisplayName: commandRow.map_display_name,
        rosterRows,
      });

      await connection.commit();

      const leaseExpiresAtIso =
        leaseInfo.lease_expires_at instanceof Date
          ? leaseInfo.lease_expires_at.toISOString()
          : new Date(leaseInfo.lease_expires_at).toISOString();

      return {
        commandId: commandRow.id,
        assignmentId: commandRow.assignment_id,
        commandType: "PREPARE_MATCH",
        attempt: Number(leaseInfo.attempt_count),
        leaseToken: rawLeaseToken,
        leaseExpiresAt: leaseExpiresAtIso,
        target: {
          serverKey: commandRow.server_key,
        },
        matchSpec,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async submitCommandResult(
    bridgeNodeKey: string,
    commandId: string,
    input: SubmitResultRequestBody,
  ): Promise<void> {
    const connection = await this.databaseService.getPool().getConnection();
    try {
      await connection.beginTransaction();

      // 1. Lock command row
      const [commandRows] = await connection.execute<CommandStatusRow[]>(
        `SELECT
           id,
           bridge_node_key,
           command_type,
           status,
           lease_token_digest,
           lease_expires_at,
           result_code,
           result_json,
           CASE
             WHEN lease_expires_at IS NOT NULL AND lease_expires_at > UTC_TIMESTAMP(6) THEN 1
             ELSE 0
           END AS is_lease_active
         FROM match_server_commands
         WHERE id = ?
         FOR UPDATE`,
        [commandId],
      );

      const command = commandRows[0];
      if (!command) {
        throw new MatchBridgeError("Command not found.", 404, "command_not_found");
      }

      // Authorize that command belongs to the authenticated bridge node
      if (command.bridge_node_key !== bridgeNodeKey) {
        throw new MatchBridgeError(
          "Not authorized to submit result for this command.",
          403,
          "forbidden",
        );
      }

      const requestLeaseTokenDigest = createHash("sha256")
        .update(input.leaseToken)
        .digest("hex");

      const canonicalResultJson = canonicalizeJson(input.result);
      const resultCode = input.resultCode;

      if (!resultCode || resultCode !== resultCode.trim()) {
        throw new MatchBridgeError("resultCode must be a non-empty string.", 400, "invalid_result_code");
      }

      // 2. Handle terminal idempotency
      if (command.status === "SUCCEEDED" || command.status === "FAILED") {
        if (
          command.status === input.outcome &&
          command.result_code === resultCode &&
          command.result_json === canonicalResultJson &&
          command.lease_token_digest === requestLeaseTokenDigest
        ) {
          await connection.commit();
          return;
        }

        throw new MatchBridgeError(
          "Terminal command result conflict.",
          409,
          "conflict",
        );
      }

      // 3. Command must be currently CLAIMED
      if (command.status !== "CLAIMED") {
        throw new MatchBridgeError(
          `Cannot record result for command in status '${command.status}'.`,
          400,
          "invalid_status",
        );
      }

      // 4. Validate lease token
      if (command.lease_token_digest !== requestLeaseTokenDigest) {
        throw new MatchBridgeError(
          "Stale or invalid lease token.",
          409,
          "lease_lost",
        );
      }

      // 5. Validate lease active (not expired)
      if (command.is_lease_active !== 1) {
        throw new MatchBridgeError(
          "Command lease has expired.",
          409,
          "lease_lost",
        );
      }

      // 6. Outcome specific validation
      if (command.command_type === "PREPARE_MATCH" && input.outcome === "SUCCEEDED") {
        if (resultCode !== "PREPARED") {
          throw new MatchBridgeError(
            `PREPARE_MATCH success requires resultCode 'PREPARED', got '${resultCode}'.`,
            400,
            "invalid_result_code",
          );
        }
      }

      // 7. Record terminal result
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE match_server_commands
         SET
           status = ?,
           result_code = ?,
           result_json = ?
         WHERE id = ?`,
        [input.outcome, resultCode, canonicalResultJson, commandId],
      );

      if (updateResult.affectedRows !== 1) {
        throw new TypeError("Failed to record terminal command result.");
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
