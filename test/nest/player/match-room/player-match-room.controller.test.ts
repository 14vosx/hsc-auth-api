import test from "node:test";
import assert from "node:assert/strict";
import { HttpException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";

import { PlayerAuthGuard } from "../../../../src/nest/player/auth/player-auth.guard.js";
import { PlayerCsrfGuard } from "../../../../src/nest/player/security/player-csrf.guard.js";
import { PlayerAccountThrottlerGuard } from "../../../../src/nest/player/security/player-account-throttler.guard.js";
import { PlayerMatchRoomController } from "../../../../src/nest/player/match-room/player-match-room.controller.js";

const PLAYER = { playerAccountId: "11111111-1111-4111-8111-111111111111" } as any;
const SNAPSHOT = {
  room: { id: "room", status: "FORMING", version: 1, creator: { playerAccountId: PLAYER.playerAccountId }, participantCount: 1, capacity: 10, participants: [] },
  viewer: { participant: true, creator: true, actions: { canJoin: false, canLeave: false, canCancel: true } },
} as any;

test("routes are player-authenticated and every mutation has CSRF and scoped throttling guards", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlayerMatchRoomController), [PlayerAuthGuard]);
  for (const name of ["create", "join", "leave", "cancel"] as const) {
    const handler = PlayerMatchRoomController.prototype[name];
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, handler), [PlayerCsrfGuard, PlayerAccountThrottlerGuard]);
  }
  assert.equal(Reflect.getMetadata(PATH_METADATA, PlayerMatchRoomController), "player/match-rooms");
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
