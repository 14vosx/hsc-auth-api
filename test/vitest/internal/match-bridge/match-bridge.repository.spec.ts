import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { MatchBridgeRepository, MatchBridgeError } from "../../../../src/nest/internal/match-bridge/match-bridge.repository.js";
import type { DatabaseService } from "../../../../src/nest/database/database.service.js";

function isCommandLookup(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim();
  return normalized.includes("FROM match_server_commands WHERE id = ?");
}

function mockDatabaseService(queriesHandler: (sql: string, values: unknown[]) => any) {
  const executedQueries: Array<{ sql: string; values: unknown[] }> = [];

  const fakePool = {
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async execute(sql: string, values: unknown[] = []) {
          executedQueries.push({ sql, values });
          const res = queriesHandler(sql, values);
          return res;
        },
        async query(sql: string, values: unknown[] = []) {
          executedQueries.push({ sql, values });
          const res = queriesHandler(sql, values);
          return res;
        },
      };
    },
    async execute(sql: string, values: unknown[] = []) {
      executedQueries.push({ sql, values });
      const res = queriesHandler(sql, values);
      return res;
    },
    async query(sql: string, values: unknown[] = []) {
      executedQueries.push({ sql, values });
      const res = queriesHandler(sql, values);
      return res;
    },
  };

  return {
    databaseService: {
      getPool() {
        return fakePool as any;
      },
    } as unknown as DatabaseService,
    executedQueries,
  };
}

describe("MatchBridgeRepository — submitCommandResult finalization", () => {
  const bridgeNodeKey = "node-01";
  const commandId = "cmd-100";
  const leaseToken = "lease-tok-abc";
  const leaseTokenDigest = createHash("sha256").update(leaseToken).digest("hex");

  const baseCommandRow = {
    id: commandId,
    bridge_node_key: bridgeNodeKey,
    command_type: "PREPARE_MATCH",
    status: "CLAIMED",
    lease_token_digest: leaseTokenDigest,
    lease_expires_at: new Date(Date.now() + 30000),
    result_code: null,
    result_json: null,
    is_lease_active: 1,
  };

  const baseContextRow = {
    command_id: commandId,
    command_type: "PREPARE_MATCH",
    command_runtime_match_id: 1000001,
    command_bridge_node_key: bridgeNodeKey,
    assignment_id: "asg-1",
    assignment_server_key: "sv-1",
    assignment_competitive_match_id: "cm-1",
    assignment_released_at: null,
    competitive_match_id: "cm-1",
    competitive_match_room_id: "room-1",
    match_runtime_match_id: 1000001,
    resource_server_key: "sv-1",
    resource_enabled: 1,
    resource_join_reference: "connect 127.0.0.1:27015",
    room_id: "room-1",
    room_status: "PROVISIONING",
    room_version: 1,
    room_joinable_at: null,
    room_failed_at: null,
    room_failure_reason: null,
  };

  const valid10FrozenRoster = Array.from({ length: 10 }, (_, i) => ({
    player_account_id: `p-${i + 1}`,
    steamid64: `7656119800000000${i + 1}`,
    team: i < 5 ? "A" : "B",
  }));

  const valid10Accounts = Array.from({ length: 10 }, (_, i) => ({
    id: `p-${i + 1}`,
    status: "active",
  }));

  const valid10SteamIdentities = Array.from({ length: 10 }, (_, i) => ({
    player_account_id: `p-${i + 1}`,
    steamid64: `7656119800000000${i + 1}`,
  }));

  const valid10Memberships = Array.from({ length: 10 }, (_, i) => ({
    player_account_id: `p-${i + 1}`,
    status: "active",
    expires_at: null,
    now_utc: new Date(),
  }));

  function handleRosterEligibilityQueries(
    sql: string,
    overrides?: {
      frozenRoster?: any[];
      accounts?: any[];
      steamIdentities?: any[];
      memberships?: any[];
    },
  ) {
    if (sql.includes("FROM competitive_match_roster")) {
      return [overrides?.frozenRoster ?? valid10FrozenRoster];
    }
    if (sql.includes("FROM player_accounts")) {
      return [overrides?.accounts ?? valid10Accounts];
    }
    if (sql.includes("FROM player_steam_identities")) {
      return [overrides?.steamIdentities ?? valid10SteamIdentities];
    }
    if (sql.includes("FROM player_memberships")) {
      return [overrides?.memberships ?? valid10Memberships];
    }
    return null;
  }

  it("Scenario A: valid SUCCEEDED/PREPARED transitions PROVISIONING -> JOINABLE, locks eligibility rows, and keeps assignment active", async () => {
    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql);
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      result: { ok: true },
    });

    const rosterQuery = executedQueries.find((q) => q.sql.includes("FROM competitive_match_roster"));
    const accountQuery = executedQueries.find((q) => q.sql.includes("FROM player_accounts"));
    const steamQuery = executedQueries.find((q) => q.sql.includes("FROM player_steam_identities"));
    const membershipQuery = executedQueries.find((q) => q.sql.includes("FROM player_memberships"));

    expect(rosterQuery?.sql).toContain("FOR UPDATE");
    expect(accountQuery?.sql).toContain("FOR UPDATE");
    expect(steamQuery?.sql).toContain("FOR UPDATE");
    expect(membershipQuery?.sql).toContain("FOR UPDATE");

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeDefined();
    expect(roomUpdate?.sql).toContain("status = 'JOINABLE'");
    expect(roomUpdate?.sql).toContain("joinable_at = UTC_TIMESTAMP(6)");
    expect(roomUpdate?.sql).toContain("version = version + 1");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario B: frozen roster account no longer active transitions PROVISIONING -> FAILED (roster_eligibility_lost)", async () => {
    const disabledAccounts = valid10Accounts.map((a, idx) =>
      idx === 0 ? { ...a, status: "disabled" } : a,
    );

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql, { accounts: disabledAccounts });
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeDefined();
    expect(roomUpdate?.sql).toContain("status = 'FAILED'");
    expect(roomUpdate?.sql).toContain("failure_reason = 'roster_eligibility_lost'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario C: exact frozen SteamID64 no longer belongs to playerAccount -> FAILED (roster_eligibility_lost)", async () => {
    const unlinkedSteamIdentities = valid10SteamIdentities.map((s, idx) =>
      idx === 0 ? { ...s, steamid64: "76561198099999999" } : s,
    );

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql, { steamIdentities: unlinkedSteamIdentities });
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate?.sql).toContain("failure_reason = 'roster_eligibility_lost'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario C1 (Multiple Steam Identities): player with multiple linked Steam identities remains eligible if frozen SteamID64 is present", async () => {
    const multiSteamIdentities = [
      { player_account_id: "p-1", steamid64: "76561198099999999" },
      ...valid10SteamIdentities,
    ];

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql, { steamIdentities: multiSteamIdentities });
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      result: { ok: true },
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeDefined();
    expect(roomUpdate?.sql).toContain("status = 'JOINABLE'");
    expect(roomUpdate?.sql).toContain("joinable_at = UTC_TIMESTAMP(6)");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it.each([
    {
      label: "membership row missing",
      memberships: valid10Memberships.slice(1),
    },
    {
      label: "membership status inactive",
      memberships: valid10Memberships.map((m, idx) => (idx === 0 ? { ...m, status: "inactive" } : m)),
    },
    {
      label: "membership status expired",
      memberships: valid10Memberships.map((m, idx) => (idx === 0 ? { ...m, status: "expired" } : m)),
    },
  ])("Scenario D ($label): membership ineligibility -> FAILED (roster_eligibility_lost)", async ({ memberships }) => {
    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql, { memberships });
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate?.sql).toContain("failure_reason = 'roster_eligibility_lost'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario E: assigned ServerResource disabled -> FAILED (server_resource_unavailable)", async () => {
    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow, resource_enabled: 0 }]];
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate?.sql).toContain("failure_reason = 'server_resource_unavailable'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario F: terminal PREPARE_MATCH outcome FAILED -> FAILED (prepare_match_failed)", async () => {
    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow }]];
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "FAILED",
      resultCode: "SPAWN_TIMEOUT",
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate?.sql).toContain("status = 'FAILED'");
    expect(roomUpdate?.sql).toContain("failure_reason = 'prepare_match_failed'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario G & H (JOINABLE Idempotency): exact idempotent replay after JOINABLE skips version bump", async () => {
    const terminalCommandRow = {
      ...baseCommandRow,
      status: "SUCCEEDED",
      result_code: "PREPARED",
      result_json: JSON.stringify({ ok: true }),
    };

    const joinableContextRow = {
      ...baseContextRow,
      room_status: "JOINABLE",
      room_joinable_at: new Date(),
    };

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...terminalCommandRow }]];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...joinableContextRow }]];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      result: { ok: true },
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeUndefined();

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Scenario H (FAILED Terminal Replay Idempotency): exact replay of FAILED command with FAILED(prepare_match_failed) room succeeds without updating room", async () => {
    const terminalFailedCommandRow = {
      ...baseCommandRow,
      status: "FAILED",
      result_code: "SPAWN_TIMEOUT",
      result_json: JSON.stringify({ error: "timeout" }),
    };

    const failedContextRow = {
      ...baseContextRow,
      room_status: "FAILED",
      room_failed_at: new Date(),
      room_failure_reason: "prepare_match_failed",
    };

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...terminalFailedCommandRow }]];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...failedContextRow }]];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "FAILED",
      resultCode: "SPAWN_TIMEOUT",
      result: { error: "timeout" },
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeUndefined();

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Adjustment 1 (Replay Healing): exact terminal replay heals PROVISIONING room", async () => {
    const terminalCommandRow = {
      ...baseCommandRow,
      status: "SUCCEEDED",
      result_code: "PREPARED",
      result_json: JSON.stringify({ ok: true }),
    };

    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...terminalCommandRow }]];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow, room_status: "PROVISIONING" }]];
      const eligibilityRes = handleRosterEligibilityQueries(sql);
      if (eligibilityRes) return eligibilityRes;
      if (sql.includes("UPDATE match_rooms")) return [{ affectedRows: 1 }];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await repo.submitCommandResult(bridgeNodeKey, commandId, {
      leaseToken,
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      result: { ok: true },
    });

    const roomUpdate = executedQueries.find((q) => q.sql.includes("UPDATE match_rooms"));
    expect(roomUpdate).toBeDefined();
    expect(roomUpdate?.sql).toContain("status = 'JOINABLE'");

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });

  it("Adjustment 2 (PREPARED validation on replay): terminal SUCCEEDED replay cannot bypass PREPARED invariant", async () => {
    const terminalCommandRow = {
      ...baseCommandRow,
      status: "SUCCEEDED",
      result_code: "PREPARED",
      result_json: JSON.stringify({ ok: true }),
    };

    const { databaseService } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...terminalCommandRow }]];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await expect(
      repo.submitCommandResult(bridgeNodeKey, commandId, {
        leaseToken,
        outcome: "SUCCEEDED",
        resultCode: "NOT_PREPARED",
        result: { ok: true },
      }),
    ).rejects.toThrow(MatchBridgeError);
  });

  it("Adjustment 2 (Terminal Coherence): throws error on incoherent terminal state (FAILED command + JOINABLE room)", async () => {
    const terminalFailedCommandRow = {
      ...baseCommandRow,
      status: "FAILED",
      result_code: "SPAWN_TIMEOUT",
      result_json: JSON.stringify({ error: true }),
    };

    const joinableContextRow = {
      ...baseContextRow,
      room_status: "JOINABLE",
    };

    const { databaseService } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...terminalFailedCommandRow }]];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...joinableContextRow }]];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await expect(
      repo.submitCommandResult(bridgeNodeKey, commandId, {
        leaseToken,
        outcome: "FAILED",
        resultCode: "SPAWN_TIMEOUT",
        result: { error: true },
      }),
    ).rejects.toThrow(TypeError);
  });

  it("Scenario I: structural mismatch throws instead of releasing assignment", async () => {
    const { databaseService, executedQueries } = mockDatabaseService((sql) => {
      if (isCommandLookup(sql)) return [[{ ...baseCommandRow }]];
      if (sql.includes("UPDATE match_server_commands")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM match_server_commands c")) return [[{ ...baseContextRow, assignment_released_at: new Date() }]];
      return [[]];
    });

    const repo = new MatchBridgeRepository(databaseService);
    await expect(
      repo.submitCommandResult(bridgeNodeKey, commandId, {
        leaseToken,
        outcome: "SUCCEEDED",
        resultCode: "PREPARED",
      }),
    ).rejects.toThrow(TypeError);

    const releaseQuery = executedQueries.find((q) => q.sql.includes("UPDATE match_server_assignments"));
    expect(releaseQuery).toBeUndefined();
  });
});
