import test from "node:test";
import assert from "node:assert/strict";
import { HttpException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { PlayerAuthGuard } from "../../../../src/nest/player/auth/player-auth.guard.js";
import { PlayerAccountThrottlerGuard } from "../../../../src/nest/player/security/player-account-throttler.guard.js";
import { PlayerCsrfGuard } from "../../../../src/nest/player/security/player-csrf.guard.js";
import { PlayerPresentationReferenceController } from "../../../../src/nest/player/presentation-reference/player-presentation-reference.controller.js";

test("presentation reference resolve is an authenticated, CSRF-protected throttled POST", () => {
  const handler = PlayerPresentationReferenceController.prototype.resolve;
  assert.equal(Reflect.getMetadata(PATH_METADATA, PlayerPresentationReferenceController), "player/presentation-references");
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlayerPresentationReferenceController), [PlayerAuthGuard]);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, handler), [PlayerCsrfGuard, PlayerAccountThrottlerGuard]);
});

test("endpoint returns only references and missing, without account identity leakage", async () => {
  const reference = {
    steam: { steamId64: "76561190000000000", personaname: "Player", avatarMediumUrl: null },
    profile: null,
  };
  const controller = new PlayerPresentationReferenceController({
    async resolveBySteamIds() { return { references: { "76561190000000000": reference }, missing: [] }; },
  });
  const response = await controller.resolve({ steamIds: ["76561190000000000"] });
  assert.deepEqual(response, { ok: true, references: { "76561190000000000": reference }, missing: [] });
  assert.equal(JSON.stringify(response).includes("playerAccountId"), false);
});

test("endpoint rejects invalid bodies and sanitizes unexpected errors", async () => {
  const controller = new PlayerPresentationReferenceController({
    async resolveBySteamIds() { throw new Error("database details"); },
  });
  await assert.rejects(controller.resolve({ steamIds: ["bad"] }), (error) =>
    error instanceof HttpException && error.getStatus() === 400);
  await assert.rejects(controller.resolve({ steamIds: ["76561190000000000"] }), (error) =>
    error instanceof HttpException && error.getStatus() === 500 &&
      (error.getResponse() as any).error === "player_presentation_reference_resolution_failed");
});
