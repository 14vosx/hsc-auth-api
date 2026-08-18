import test from "node:test";
import assert from "node:assert/strict";
import { HttpException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";

import { PlayerAuthGuard } from "../../../../src/nest/player/auth/player-auth.guard.js";
import { PlayerCsrfGuard } from "../../../../src/nest/player/security/player-csrf.guard.js";
import { PlayerAccountThrottlerGuard } from "../../../../src/nest/player/security/player-account-throttler.guard.js";
import { PlayerMatchRoomController } from "../../../../src/nest/player/match-room/player-match-room.controller.js";
import { MatchRoomError } from "../../../../src/nest/match/match-room.error.js";

const PLAYER = { playerAccountId: "11111111-1111-4111-8111-111111111111" } as any;
const SNAPSHOT = {
  room: { id: "room", status: "FORMING", version: 1, creator: { playerAccountId: PLAYER.playerAccountId }, participantCount: 1, capacity: 10, participants: [] },
  viewer: { participant: true, creator: true, actions: { canJoin: false, canLeave: false, canCancel: true, canDraftPick: false, canMapVetoBan: false } },
} as any;

test("routes are player-authenticated and every mutation has CSRF and scoped throttling guards", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlayerMatchRoomController), [PlayerAuthGuard]);
  for (const name of ["create", "join", "leave", "cancel", "confirm", "draftPick", "mapVetoBan"] as const) {
    const handler = PlayerMatchRoomController.prototype[name];
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, handler), [PlayerCsrfGuard, PlayerAccountThrottlerGuard]);
  }
  assert.equal(Reflect.getMetadata(PATH_METADATA, PlayerMatchRoomController), "player/match-rooms");
});

test("confirm uses the authenticated actor and preserves the mutation envelope", async () => {
  let received: [string, string] | null = null;
  const controller = new PlayerMatchRoomController({
    async confirm(roomId: string, playerId: string) {
      received = [roomId, playerId];
      return SNAPSHOT;
    },
  } as any);
  const result = await controller.confirm("room", {
    player: PLAYER, body: { playerAccountId: "attacker" },
  } as any);
  assert.deepEqual(received, ["room", PLAYER.playerAccountId]);
  assert.deepEqual(result, { ok: true, matchRoom: SNAPSHOT });
});

test("controller derives mutation actor only from PlayerAuthGuard session", async () => {
  let received: string | null = null;
  const controller = new PlayerMatchRoomController({
    async create(id: string) { received = id; return SNAPSHOT; },
  } as any);
  const result = await controller.create({
    player: PLAYER, body: { playerAccountId: "attacker" },
  } as any);
  assert.equal(received, PLAYER.playerAccountId);
  assert.deepEqual(result, { ok: true, matchRoom: SNAPSHOT });
});

test("singular reads and mutations use the same matchRoom envelope", async () => {
  const controller = new PlayerMatchRoomController({
    async current() { return SNAPSHOT; },
    async get() { return SNAPSHOT; },
  } as any);
  assert.deepEqual(await controller.current({ player: PLAYER }), {
    ok: true, matchRoom: SNAPSHOT,
  });
  assert.deepEqual(await controller.get("room", { player: PLAYER }), {
    ok: true, matchRoom: SNAPSHOT,
  });

  const emptyController = new PlayerMatchRoomController({
    async current() { return null; },
  } as any);
  assert.deepEqual(await emptyController.current({ player: PLAYER }), {
    ok: true, matchRoom: null,
  });
});

test("missing authenticated player identity stays a sanitized 401", async () => {
  const controller = new PlayerMatchRoomController({} as any);
  await assert.rejects(controller.create({ player: {} as any }), (error) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 401);
    assert.equal((error.getResponse() as any).error, "invalid_session");
    return true;
  });
});

test("draftPick validates body, enforces guards, and maps errors", async () => {
  let received: [string, string, string] | null = null;
  const controller = new PlayerMatchRoomController({
    async draftPick(roomId: string, viewerId: string, targetId: string) {
      if (targetId === "forbidden") throw new MatchRoomError("not_draft_picker");
      if (targetId === "conflict") throw new MatchRoomError("draft_target_not_available");
      received = [roomId, viewerId, targetId];
      return SNAPSHOT;
    },
  } as any);

  // Invalid body (missing or extra keys)
  await assert.rejects(
    controller.draftPick("room", {}, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 400,
  );
  await assert.rejects(
    controller.draftPick("room", { playerAccountId: "p1", extra: true }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 400,
  );

  // 403 Forbidden mapping for not_draft_picker
  await assert.rejects(
    controller.draftPick("room", { playerAccountId: "forbidden" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 403,
  );

  // 409 Conflict mapping for draft_target_not_available
  await assert.rejects(
    controller.draftPick("room", { playerAccountId: "conflict" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 409,
  );

  // Success
  const result = await controller.draftPick(
    "room",
    { playerAccountId: "target-123" },
    { player: PLAYER } as any,
  );
  assert.deepEqual(received, ["room", PLAYER.playerAccountId, "target-123"]);
  assert.deepEqual(result, { ok: true, matchRoom: SNAPSHOT });
});

test("mapVetoBan validates body, enforces guards, and maps errors", async () => {
  let received: [string, string, string] | null = null;
  const controller = new PlayerMatchRoomController({
    async mapVetoBan(roomId: string, viewerId: string, mapKey: string) {
      if (mapKey === "forbidden") throw new MatchRoomError("not_map_vetoer");
      if (mapKey === "conflict") throw new MatchRoomError("map_veto_target_not_available");
      if (mapKey === "closed") throw new MatchRoomError("map_veto_window_closed");
      if (mapKey === "not_vetoing") throw new MatchRoomError("room_not_vetoing");
      received = [roomId, viewerId, mapKey];
      return SNAPSHOT;
    },
  } as any);

  // Invalid body (missing or extra keys)
  await assert.rejects(
    controller.mapVetoBan("room", {}, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 400,
  );
  await assert.rejects(
    controller.mapVetoBan("room", { mapKey: "de_dust2", extra: true }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 400,
  );

  // 403 Forbidden mapping for not_map_vetoer
  await assert.rejects(
    controller.mapVetoBan("room", { mapKey: "forbidden" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 403,
  );

  // 409 Conflict mapping for map_veto_target_not_available
  await assert.rejects(
    controller.mapVetoBan("room", { mapKey: "conflict" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 409,
  );

  // 409 Conflict mapping for map_veto_window_closed
  await assert.rejects(
    controller.mapVetoBan("room", { mapKey: "closed" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 409,
  );

  // 409 Conflict mapping for room_not_vetoing
  await assert.rejects(
    controller.mapVetoBan("room", { mapKey: "not_vetoing" }, { player: PLAYER } as any),
    (error: any) => error instanceof HttpException && error.getStatus() === 409,
  );

  // Success
  const result = await controller.mapVetoBan(
    "room",
    { mapKey: "de_inferno" },
    { player: PLAYER } as any,
  );
  assert.deepEqual(received, ["room", PLAYER.playerAccountId, "de_inferno"]);
  assert.deepEqual(result, { ok: true, matchRoom: SNAPSHOT });
});
