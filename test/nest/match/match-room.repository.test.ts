import test from "node:test";
import assert from "node:assert/strict";

import { MatchRoomError } from "../../../src/nest/match/match-room.error.js";
import { MatchRoomRepository } from "../../../src/nest/match/match-room.repository.js";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";

function eligibleRows() {
  return [[{
    account_status: "active", has_steam: 1, membership_status: "active",
    membership_expires_at: null, now_utc: "2026-08-17 12:00:00",
  }], []];
}

function harness(execute: (sql: string, values?: unknown[]) => Promise<any>) {
  const events: string[] = [];
  const queries: string[] = [];
  const connection = {
    execute,
    async query(sql: string) { queries.push(sql); return [[], []]; },
    async beginTransaction() { events.push("begin"); },
    async commit() { events.push("commit"); },
    async rollback() { events.push("rollback"); },
    release() { events.push("release"); },
  };
  const repository = new MatchRoomRepository({
    getPool() { return { execute, async getConnection() { return connection; } }; },
  } as any);
  return { repository, events, queries };
}

test("create atomically creates the room and creator participation", async () => {
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("SELECT a.status")) return eligibleRows();
    return [{ affectedRows: 1 }, []];
  });
  await repository.create(PLAYER);
  assert.equal(statements.some((sql) => sql.includes("INSERT INTO match_rooms")), true);
  assert.equal(statements.some((sql) => sql.includes("INSERT INTO match_room_participants")), true);
  assert.deepEqual(events, ["begin", "commit", "release"]);
});

test("create rolls the room back when creator participation fails", async () => {
  const { repository, events } = harness(async (sql) => {
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("INSERT INTO match_room_participants")) throw new Error("participant failure");
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.create(PLAYER), /participant failure/);
  assert.deepEqual(events, ["begin", "rollback", "release"]);
});

test("create rejects an ineligible player before inserting", async () => {
  let inserted = false;
  const { repository, events } = harness(async (sql) => {
    if (sql.includes("SELECT a.status")) return [[{
      account_status: "active", has_steam: 0, membership_status: "active",
      membership_expires_at: null, now_utc: "2026-08-17 12:00:00",
    }], []];
    inserted = true;
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.create(PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "steam_identity_not_linked");
  assert.equal(inserted, false);
  assert.deepEqual(events, ["begin", "rollback", "release"]);
});

test("join locks the room and rejects the eleventh active participant", async () => {
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("player_account_id = ?")) return [[{ participant_count: 0 }], []];
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 10 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.join(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "room_full");
  assert.equal(statements[0]?.includes("FOR UPDATE"), true);
  assert.equal(statements.some((sql) => sql.includes("INSERT INTO match_room_participants")), false);
  assert.equal(statements.some((sql) => sql.includes("UPDATE match_rooms")), false);
  assert.equal(statements.some((sql) => sql.includes("UPDATE match_room_participants")), false);
  assert.equal(statements.some((sql) => sql.includes("SET released_at")), false);
  // Domain conflicts are materialized after the transaction outcome commits.
  // For room_full this is a read-only/empty commit: no aggregate mutation occurred.
  assert.deepEqual(events, ["begin", "commit", "release"]);
});

test("join accepts the tenth eligible participant and rejects inactive membership", async () => {
  let inserted = false;
  const statements: string[] = [];
  const eligibleHarness = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("player_account_id = ?")) return [[{ participant_count: 0 }], []];
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 9 }], []];
    if (sql.includes("INSERT INTO match_room_participants")) inserted = true;
    return [{ affectedRows: 1 }, []];
  });
  await eligibleHarness.repository.join(ROOM, PLAYER);
  assert.equal(inserted, true);
  const transition = statements.find((sql) =>
    sql.includes("UPDATE match_rooms") &&
    sql.includes("confirmation_round = confirmation_round + 1"));
  assert.ok(transition);
  assert.match(transition, /status = 'CONFIRMING'/);
  assert.match(transition, /confirmation_round = confirmation_round \+ 1/);
  assert.match(transition, /confirmation_started_at = UTC_TIMESTAMP\(6\)/);
  assert.match(transition, /confirmation_deadline_at = DATE_ADD/);
  assert.match(transition, /DATE_ADD\(UTC_TIMESTAMP\(6\), INTERVAL 30 SECOND\)/);
  assert.match(transition, /version = version \+ 1/);
  assert.equal(statements.filter((sql) => sql.includes("version = version + 1")).length, 1);

  const inactiveHarness = harness(async (sql) => {
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return [[{
      account_status: "active", has_steam: 1, membership_status: "suspended",
      membership_expires_at: null, now_utc: "2026-08-17 12:00:00",
    }], []];
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(inactiveHarness.repository.join(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "membership_suspended");
});

test("duplicate active-player constraint becomes stable already_in_active_room", async () => {
  const { repository } = harness(async (sql) => {
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 0 }], []];
    if (sql.includes("INSERT INTO match_room_participants")) {
      throw Object.assign(
        new Error("Duplicate entry for key 'uniq_match_room_active_player'"),
        {
          code: "ER_DUP_ENTRY",
          sqlMessage: "Duplicate entry 'player' for key 'uniq_match_room_active_player'",
        },
      );
    }
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.join(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "already_in_active_room");
});

test("an unrelated duplicate key is not classified as already_in_active_room", async () => {
  const primaryDuplicate = Object.assign(
    new Error("Duplicate entry for key 'PRIMARY'"),
    { code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry 'id' for key 'PRIMARY'" },
  );
  const { repository } = harness(async (sql) => {
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("INSERT INTO match_rooms")) throw primaryDuplicate;
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.create(PLAYER), (error) => error === primaryDuplicate);
});

test("leave releases history, creator must cancel, and rejoin remains insert-based", async () => {
  const statements: string[] = [];
  const creatorHarness = harness(async (sql) => {
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: PLAYER, status: "FORMING", version: 1,
    }], []];
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(creatorHarness.repository.leave(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "creator_must_cancel_room");

  const memberHarness = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    return [{ affectedRows: 1 }, []];
  });
  await memberHarness.repository.leave(ROOM, PLAYER);
  assert.equal(statements.some((sql) => sql.includes("release_reason = 'LEFT'")), true);
  assert.equal(statements.some((sql) => sql.includes("DELETE")), false);
  assert.equal(statements.filter((sql) =>
    sql.includes("UPDATE match_rooms SET version = version + 1")).length, 1);

  const rejoinStatements: string[] = [];
  const rejoinHarness = harness(async (sql) => {
    rejoinStatements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 0 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await rejoinHarness.repository.join(ROOM, PLAYER);
  assert.equal(rejoinStatements.some((sql) => sql.includes("INSERT INTO match_room_participants")), true);
});

test("cancel changes status, increments version, and releases every active participant", async () => {
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: PLAYER, status: "FORMING", version: 4,
    }], []];
    return [{ affectedRows: 1 }, []];
  });
  await repository.cancel(ROOM, PLAYER);
  assert.equal(statements.filter((sql) =>
    sql.includes("status = 'CANCELLED'") &&
    sql.includes("version = version + 1")).length, 1);
  assert.equal(statements.some((sql) => sql.includes("release_reason = 'ROOM_CANCELLED'")), true);
  assert.deepEqual(events, ["begin", "commit", "release"]);
});

test("cancelled rooms reject join and leave", async () => {
  const { repository } = harness(async (sql) => {
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "CANCELLED", version: 2,
    }], []];
    return [{ affectedRows: 1 }, []];
  });
  for (const operation of [
    () => repository.join(ROOM, PLAYER),
    () => repository.leave(ROOM, PLAYER),
  ]) {
    await assert.rejects(operation(), (error) =>
      error instanceof MatchRoomError && error.code === "room_not_joinable");
  }
});

test("read capabilities reflect creator role, room state, capacity, and another active room", async () => {
  let activeElsewhere = 1;
  const { repository, queries } = harness(async (sql) => {
    if (sql.includes("FROM match_rooms WHERE id")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: "3",
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("SELECT player_account_id")) return [[{
      player_account_id: "creator", joined_at: "2026-08-17 12:00:00",
    }], []];
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: activeElsewhere }], []];
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const blocked = await repository.getById(ROOM, PLAYER);
  assert.equal(blocked?.viewer.actions.canJoin, false);
  assert.equal(blocked?.room.capacity, 10);
  assert.equal(blocked?.room.version, 3);
  assert.deepEqual(queries.slice(0, 2), [
    "SET TRANSACTION READ ONLY",
    "START TRANSACTION WITH CONSISTENT SNAPSHOT",
  ]);

  activeElsewhere = 0;
  const available = await repository.getById(ROOM, PLAYER);
  assert.equal(available?.viewer.actions.canJoin, true);
});

test("eligibility gates only canJoin, never safe leave/cancel capabilities", async () => {
  let account = {
    account_status: "active", has_steam: 1, membership_status: "suspended",
    membership_expires_at: null, now_utc: "2026-08-17 12:00:00",
  };
  let creator = "creator";
  let participants = [{ player_account_id: "creator", joined_at: "2026-08-17 12:00:00" }];
  let hasActiveRoom = 0;
  const { repository } = harness(async (sql) => {
    if (sql.includes("FROM match_rooms WHERE id")) return [[{
      id: ROOM, creator_player_account_id: creator, status: "FORMING", version: 1,
    }], []];
    if (sql.includes("SELECT a.status")) return [[account], []];
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: hasActiveRoom }], []];
    if (sql.includes("SELECT player_account_id")) return [participants, []];
    throw new Error(`unexpected SQL: ${sql}`);
  });

  const suspendedViewer = await repository.getById(ROOM, PLAYER);
  assert.equal(suspendedViewer?.viewer.actions.canJoin, false);

  account = { ...account, has_steam: 0, membership_status: "active" };
  const unlinkedViewer = await repository.getById(ROOM, PLAYER);
  assert.equal(unlinkedViewer?.viewer.actions.canJoin, false);

  account = { ...account, has_steam: 1 };
  const eligibleViewer = await repository.getById(ROOM, PLAYER);
  assert.equal(eligibleViewer?.viewer.actions.canJoin, true);

  account = { ...account, membership_status: "suspended" };
  participants = [{ player_account_id: PLAYER, joined_at: "2026-08-17 12:00:00" }];
  hasActiveRoom = 1;
  const suspendedParticipant = await repository.getById(ROOM, PLAYER);
  assert.equal(suspendedParticipant?.viewer.actions.canLeave, true);

  creator = PLAYER;
  const suspendedCreator = await repository.getById(ROOM, PLAYER);
  assert.equal(suspendedCreator?.viewer.actions.canCancel, true);
});

test("list computes viewer context once inside one consistent read snapshot", async () => {
  let eligibilityReads = 0;
  const { repository, queries } = harness(async (sql) => {
    if (sql.includes("SELECT id FROM match_rooms")) return [[], []];
    if (sql.includes("SELECT DISTINCT r.id")) return [[
      { id: ROOM, creator_player_account_id: "creator", status: "FORMING", version: 1 },
      { id: "room-2", creator_player_account_id: "creator-2", status: "FORMING", version: 2 },
    ], []];
    if (sql.includes("SELECT a.status")) {
      eligibilityReads += 1;
      return eligibleRows();
    }
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: 0 }], []];
    if (sql.includes("SELECT player_account_id")) return [[], []];
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const rooms = await repository.listRelevant(PLAYER);
  assert.equal(rooms.length, 2);
  assert.equal(eligibilityReads, 1);
  assert.deepEqual(queries, [
    "SET TRANSACTION READ ONLY",
    "START TRANSACTION WITH CONSISTENT SNAPSHOT",
  ]);
});

test("confirm records the current round once and retry is idempotent", async () => {
  let alreadyConfirmed = false;
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "CONFIRMING", version: 3,
      confirmation_round: 2, confirmation_started_at: "2026-08-17 12:00:00",
      confirmation_deadline_at: "2026-08-17 12:00:30", roster_locked_at: null,
      confirmation_expired: 0,
    }], []];
    if (sql.includes("SELECT confirmed_round")) return [[{
      confirmed_round: alreadyConfirmed ? 2 : null,
      confirmed_at: alreadyConfirmed ? "2026-08-17 12:00:10" : null,
    }], []];
    if (sql.includes("SET confirmed_round")) alreadyConfirmed = true;
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 1 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await repository.confirm(ROOM, PLAYER);
  const mutationsAfterFirst = statements.filter((sql) =>
    sql.includes("SET confirmed_round") || sql.includes("version = version + 1")).length;
  await repository.confirm(ROOM, PLAYER);
  assert.equal(mutationsAfterFirst, 2);
  assert.equal(statements.filter((sql) => sql.includes("SET confirmed_round")).length, 1);
  assert.equal(statements.filter((sql) => sql.includes("UPDATE match_rooms SET version")).length, 1);
  assert.deepEqual(events, ["begin", "commit", "release", "begin", "commit", "release"]);
});

test("the tenth current-round confirmation locks the roster with one version increment", async () => {
  const statements: string[] = [];
  const { repository } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "CONFIRMING", version: 11,
      confirmation_round: 1, confirmation_expired: 0,
    }], []];
    if (sql.includes("SELECT confirmed_round")) return [[{ confirmed_round: null, confirmed_at: null }], []];
    if (sql.includes("COUNT(*)")) return [[{ participant_count: 10 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await repository.confirm(ROOM, PLAYER);
  const transition = statements.find((sql) => sql.includes("status = 'SETUP'"));
  assert.ok(transition);
  assert.match(transition, /roster_locked_at = UTC_TIMESTAMP\(6\)/);
  assert.equal(statements.filter((sql) => sql.includes("version = version + 1")).length, 1);
});

test("expired confirmation keeps confirmed roster when creator confirmed", async () => {
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "CONFIRMING", version: 8,
      confirmation_round: 3, confirmation_expired: 1,
    }], []];
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: 1 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.confirm(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "confirmation_window_closed");
  assert.equal(statements.some((sql) => sql.includes("release_reason = 'CONFIRMATION_TIMEOUT'")), true);
  assert.equal(statements.some((sql) => sql.includes("confirmed_round <> ?")), true);
  assert.equal(statements.some((sql) => sql.includes("status = 'FORMING'")), true);
  assert.equal(statements.filter((sql) => sql.includes("version = version + 1")).length, 1);
  assert.deepEqual(events, ["begin", "commit", "release"]);
});

test("expired confirmation cancels and releases everyone when creator is pending", async () => {
  const statements: string[] = [];
  const { repository, events } = harness(async (sql) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "CONFIRMING", version: 8,
      confirmation_round: 3, confirmation_expired: 1,
    }], []];
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: 0 }], []];
    return [{ affectedRows: 1 }, []];
  });
  await assert.rejects(repository.confirm(ROOM, PLAYER), (error) =>
    error instanceof MatchRoomError && error.code === "confirmation_window_closed");
  assert.equal(statements.some((sql) => sql.includes("status = 'CANCELLED'")), true);
  assert.equal(statements.some((sql) => sql.includes("release_reason = 'CREATOR_CONFIRMATION_TIMEOUT'")), true);
  assert.equal(statements.filter((sql) => sql.includes("version = version + 1")).length, 1);
  assert.deepEqual(events, ["begin", "commit", "release"]);
});

test("SETUP confirm retry is accepted only for a participant confirmed in the final round", async () => {
  const { repository } = harness(async (sql) => {
    if (sql.includes("FOR UPDATE")) return [[{
      id: ROOM, creator_player_account_id: "creator", status: "SETUP", version: 14,
      confirmation_round: 4, confirmation_expired: 0,
    }], []];
    if (sql.includes("SELECT confirmed_round")) return [[{ confirmed_round: 4, confirmed_at: "time" }], []];
    throw new Error(`unexpected SQL: ${sql}`);
  });
  await repository.confirm(ROOM, PLAYER);
});

test("snapshot treats prior-round confirmation as pending and freezes roster actions", async () => {
  let status = "CONFIRMING";
  const { repository } = harness(async (sql) => {
    if (sql.includes("FROM match_rooms WHERE id")) return [[{
      id: ROOM, creator_player_account_id: "creator", status, version: 9,
      confirmation_round: 5, confirmation_started_at: "2026-08-17 12:00:00",
      confirmation_deadline_at: "2026-08-17 12:00:30", roster_locked_at: null,
      confirmation_expired: 0,
    }], []];
    if (sql.includes("SELECT a.status")) return eligibleRows();
    if (sql.includes("SELECT EXISTS")) return [[{ exists_flag: 1 }], []];
    if (sql.includes("SELECT player_account_id")) return [[{
      player_account_id: PLAYER, joined_at: "2026-08-17 11:59:00",
      confirmed_round: 4, confirmed_at: "2026-08-17 11:59:10",
    }], []];
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const confirming = await repository.getById(ROOM, PLAYER);
  assert.equal(confirming?.room.participants[0]?.confirmation.confirmed, false);
  assert.equal(confirming?.room.participants[0]?.confirmation.confirmedAt, null);
  assert.equal(confirming?.viewer.actions.canJoin, false);
  assert.equal(confirming?.viewer.actions.canLeave, false);
  assert.equal(confirming?.viewer.actions.canConfirm, true);

  status = "SETUP";
  const setup = await repository.getById(ROOM, PLAYER);
  assert.equal(setup?.viewer.actions.canJoin, false);
  assert.equal(setup?.viewer.actions.canLeave, false);
  assert.equal(setup?.viewer.actions.canConfirm, false);
});
