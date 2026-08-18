import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { validatePresentationReferenceResolveBody } from "../../../../src/nest/player/presentation-reference/player-presentation-reference.validation.js";

test("presentation reference validation accepts and deduplicates at most 100 Steam IDs", () => {
  const id = "76561190000000000";
  assert.deepEqual(validatePresentationReferenceResolveBody({ steamIds: [id, id] }), {
    ok: true, steamIds: [id],
  });
  const hundred = Array.from({ length: 100 }, (_, index) =>
    String(76561190000000000n + BigInt(index)));
  assert.equal(validatePresentationReferenceResolveBody({ steamIds: hundred }).ok, true);
});

test("presentation reference validation is strict about body, IDs, and raw batch size", () => {
  assert.deepEqual(validatePresentationReferenceResolveBody({ steamIds: [] }), { ok: false, error: "invalid_body" });
  assert.deepEqual(validatePresentationReferenceResolveBody({ steamIds: ["invalid"] }), { ok: false, error: "invalid_steam_id" });
  assert.deepEqual(validatePresentationReferenceResolveBody({ steamIds: ["76561190000000000"], extra: true }), { ok: false, error: "invalid_body" });
  const oversized = Array.from({ length: 101 }, () => "76561190000000000");
  assert.deepEqual(validatePresentationReferenceResolveBody({ steamIds: oversized }), { ok: false, error: "batch_limit_exceeded" });
});
