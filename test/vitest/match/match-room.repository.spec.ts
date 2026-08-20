import { test } from "vitest";
import assert from "node:assert/strict";
import { MatchRoomRepository } from "../../../src/nest/match/match-room.repository.js";

test("confirm during CONFIRMING status queries participant using both roomId and playerAccountId", async () => {
  const roomId = "room-uuid-123";
  const playerAccountId = "player-uuid-456";

  const executedQueries: Array<{ sql: string; values: unknown[] }> = [];

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              release() {},
              async execute(sql: string, values: unknown[]) {
                executedQueries.push({ sql, values });

                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "CONFIRMING",
                    version: 1,
                    confirmation_round: 1,
                    confirmation_started_at: new Date(),
                    confirmation_deadline_at: new Date(Date.now() + 30000),
                    roster_locked_at: null,
                    ready_at: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1")) {
                  return [[{ confirmed_round: null, confirmed_at: null }]];
                }

                if (sql.includes("UPDATE match_room_participants SET confirmed_round = ?")) {
                  return [{ affectedRows: 1 }];
                }

                if (sql.includes("SELECT COUNT(*) AS participant_count")) {
                  return [[{ participant_count: 1 }]];
                }

                if (sql.includes("UPDATE match_rooms SET version = version + 1")) {
                  return [{ affectedRows: 1 }];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {} as any,
  );

  await repository.confirm(roomId, playerAccountId);

  const participantQuery = executedQueries.find((q) =>
    q.sql.includes("FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1"),
  );

  assert.ok(participantQuery, "Participant lookup query was executed");
  assert.deepEqual(participantQuery.values, [roomId, playerAccountId]);
});

test("Scenario J: getById accepts and returns JOINABLE/FAILED lifecycle metadata", async () => {
  const roomId = "room-uuid-789";
  const playerAccountId = "player-uuid-456";
  const joinableAt = new Date();

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: joinableAt,
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.room.status, "JOINABLE");
  assert.equal(snapshot.room.joinableAt, joinableAt);
  assert.equal(snapshot.room.failedAt, null);
  assert.equal(snapshot.room.failureReason, null);
});

test("Scenario J2: getById accepts and returns FAILED lifecycle metadata", async () => {
  const roomId = "room-uuid-999";
  const playerAccountId = "player-uuid-456";
  const failedAt = new Date();

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "FAILED",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: null,
                    failed_at: failedAt,
                    failure_reason: "prepare_match_failed",
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.room.status, "FAILED");
  assert.equal(snapshot.room.joinableAt, null);
  assert.equal(snapshot.room.failedAt, failedAt);
  assert.equal(snapshot.room.failureReason, "prepare_match_failed");
});

test("Scenario K1: JOINABLE + eligible participant + active assignment + enabled resource + valid reference + valid launch URI + linked frozen Steam pair populates viewer.join and canJoinServer", async () => {
  const roomId = "room-uuid-101";
  const playerAccountId = "player-uuid-456";
  const joinableAt = new Date();

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: joinableAt,
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                if (sql.includes("FROM competitive_matches cm")) {
                  return [[{
                    server_key: "sv-match-01",
                    resource_enabled: 1,
                    join_reference: "connect ops.haxixesmokeclub.com:27015",
                    launch_uri: "steam://connect/ops.haxixesmokeclub.com:27015",
                    frozen_steamid64: "76561198000000001",
                    linked_steamid64: "76561198000000001",
                  }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.actions.canJoinServer, true);
  assert.deepEqual(snapshot.viewer.join, {
    serverKey: "sv-match-01",
    reference: "connect ops.haxixesmokeclub.com:27015",
    launchUri: "steam://connect/ops.haxixesmokeclub.com:27015",
  });
});

test("Scenario K5: JOINABLE with null launch_uri gets canJoinServer: false and join: null", async () => {
  const roomId = "room-uuid-105";
  const playerAccountId = "player-uuid-456";

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: new Date(),
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                if (sql.includes("FROM competitive_matches cm")) {
                  return [[{
                    server_key: "sv-match-01",
                    resource_enabled: 1,
                    join_reference: "connect ops.haxixesmokeclub.com:27015",
                    launch_uri: null,
                    frozen_steamid64: "76561198000000001",
                    linked_steamid64: "76561198000000001",
                  }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.actions.canJoinServer, false);
  assert.equal(snapshot.viewer.join, null);
});

test("Scenario K6: JOINABLE with whitespace-only launch_uri gets canJoinServer: false and join: null", async () => {
  const roomId = "room-uuid-106";
  const playerAccountId = "player-uuid-456";

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: new Date(),
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                if (sql.includes("FROM competitive_matches cm")) {
                  return [[{
                    server_key: "sv-match-01",
                    resource_enabled: 1,
                    join_reference: "connect ops.haxixesmokeclub.com:27015",
                    launch_uri: "   ",
                    frozen_steamid64: "76561198000000001",
                    linked_steamid64: "76561198000000001",
                  }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.actions.canJoinServer, false);
  assert.equal(snapshot.viewer.join, null);
});

test("Scenario K2: JOINABLE non-participant viewer gets canJoinServer: false and join: null", async () => {
  const roomId = "room-uuid-102";
  const nonParticipantId = "viewer-uuid-999";
  const creatorId = "creator-uuid-111";

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: creatorId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: new Date(),
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: creatorId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, nonParticipantId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.participant, false);
  assert.equal(snapshot.viewer.actions.canJoinServer, false);
  assert.equal(snapshot.viewer.join, null);
});

test("Scenario K3: PROVISIONING non-JOINABLE state gets canJoinServer: false and join: null", async () => {
  const roomId = "room-uuid-103";
  const playerAccountId = "player-uuid-456";

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "PROVISIONING",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: null,
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.actions.canJoinServer, false);
  assert.equal(snapshot.viewer.join, null);
});

test("Scenario K4: JOINABLE participant whose frozen Steam pair is no longer linked gets canJoinServer: false and join: null", async () => {
  const roomId = "room-uuid-104";
  const playerAccountId = "player-uuid-456";

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              async query() {},
              release() {},
              async execute(sql: string) {
                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "JOINABLE",
                    version: 2,
                    confirmation_round: 1,
                    confirmation_started_at: null,
                    confirmation_deadline_at: null,
                    roster_locked_at: new Date(),
                    ready_at: new Date(),
                    joinable_at: new Date(),
                    failed_at: null,
                    failure_reason: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM player_accounts a")) {
                  return [[{ account_status: "active", has_steam: 1, membership_status: "active", membership_expires_at: null, now_utc: new Date() }]];
                }

                if (sql.includes("FROM match_room_participants")) {
                  return [[{ player_account_id: playerAccountId, joined_at: new Date(), confirmed_round: 1, confirmed_at: new Date() }]];
                }

                if (sql.includes("FROM competitive_matches cm")) {
                  return [[{
                    server_key: "sv-match-01",
                    resource_enabled: 1,
                    join_reference: "connect 127.0.0.1:27015",
                    frozen_steamid64: "76561198000000001",
                    linked_steamid64: null,
                  }]];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {
      async findByRoomIdOnConnection() {
        return null;
      },
    } as any,
  );

  const snapshot = await repository.getById(roomId, playerAccountId);
  assert.ok(snapshot);
  assert.equal(snapshot.viewer.actions.canJoinServer, false);
  assert.equal(snapshot.viewer.join, null);
});
