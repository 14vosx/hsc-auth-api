import { describe, it, expect } from "vitest";
import { ContextualServerAccessRepository } from "../../../../src/nest/internal/server-access/contextual-server-access.repository.js";
import type { DatabaseService } from "../../../../src/nest/database/database.service.js";

function mockDatabaseService(row: Record<string, any> | null) {
  const fakePool = {
    async execute() {
      return [row ? [row] : []];
    },
  };

  return {
    getPool() {
      return fakePool as any;
    },
  } as unknown as DatabaseService;
}

describe("ContextualServerAccessRepository — authorize", () => {
  const steamid64 = "76561198000000001";
  const serverKey = "sv-match-01";

  const baseValidRow = {
    player_account_id: "player-1",
    account_status: "active",
    membership_status: "active",
    membership_expires_at: null,
    now_utc: new Date(),
    resource_server_key: serverKey,
    resource_enabled: 1,
    assignment_id: "asg-1",
    assignment_competitive_match_id: "cm-1",
    competitive_match_id: "cm-1",
    match_room_id: "room-1",
    room_id: "room-1",
    room_status: "JOINABLE",
    roster_player_account_id: "player-1",
  };

  it("Scenario 1: exact frozen roster pair + PROVISIONING -> authorized: false, reason: 'server_preparing'", async () => {
    const dbService = mockDatabaseService({
      ...baseValidRow,
      room_status: "PROVISIONING",
    });

    const repo = new ContextualServerAccessRepository(dbService);
    const decision = await repo.authorize(steamid64, serverKey);

    expect(decision).toEqual({
      authorized: false,
      reason: "server_preparing",
    });
  });

  it("Scenario 2: exact frozen roster pair + JOINABLE -> authorized: true, reason: 'match_joinable'", async () => {
    const dbService = mockDatabaseService({
      ...baseValidRow,
      room_status: "JOINABLE",
    });

    const repo = new ContextualServerAccessRepository(dbService);
    const decision = await repo.authorize(steamid64, serverKey);

    expect(decision).toEqual({
      authorized: true,
      reason: "match_joinable",
    });
  });

  it("Scenario 3: exact frozen roster pair + FAILED -> authorized: false, reason: 'match_failed'", async () => {
    const dbService = mockDatabaseService({
      ...baseValidRow,
      room_status: "FAILED",
    });

    const repo = new ContextualServerAccessRepository(dbService);
    const decision = await repo.authorize(steamid64, serverKey);

    expect(decision).toEqual({
      authorized: false,
      reason: "match_failed",
    });
  });

  it("Scenario 4: JOINABLE but exact requested identity pair absent from frozen roster -> authorized: false, reason: 'not_match_roster'", async () => {
    const dbService = mockDatabaseService({
      ...baseValidRow,
      room_status: "JOINABLE",
      roster_player_account_id: null,
    });

    const repo = new ContextualServerAccessRepository(dbService);
    const decision = await repo.authorize(steamid64, serverKey);

    expect(decision).toEqual({
      authorized: false,
      reason: "not_match_roster",
    });
  });
});
