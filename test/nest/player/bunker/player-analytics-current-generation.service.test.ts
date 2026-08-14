import test from "node:test";
import assert from "node:assert/strict";

import { PlayerAnalyticsCurrentGenerationService } from "../../../../src/nest/player/bunker/player-analytics-current-generation.service.js";

test("current generation - resolves the accepted directory for current", async () => {
  const generationId = "20260814T220431007488Z-f95fc416";
  const root = `/storage/accepted/${generationId}`;
  let acceptedInput: string | null = null;
  let directoryInput: string | null = null;
  const service = new PlayerAnalyticsCurrentGenerationService({
    async readCurrent() { return generationId; },
    acceptedPath(value: string) { acceptedInput = value; return root; },
    async isRealDirectory(value: string) { directoryInput = value; return true; },
  } as any);

  assert.deepEqual(await service.read(), { ok: true, generationId, root });
  assert.equal(acceptedInput, generationId);
  assert.equal(directoryInput, root);
});

test("current generation - missing current returns not_found", async () => {
  const service = new PlayerAnalyticsCurrentGenerationService({
    async readCurrent() { return null; },
  } as any);
  assert.deepEqual(await service.read(), { ok: false, reason: "not_found" });
});

test("current generation - invalid accepted directory returns unavailable", async () => {
  const service = new PlayerAnalyticsCurrentGenerationService({
    async readCurrent() { return "20260814T220431007488Z-f95fc416"; },
    acceptedPath() { return "/storage/accepted/generation"; },
    async isRealDirectory() { return false; },
  } as any);
  assert.deepEqual(await service.read(), { ok: false, reason: "unavailable" });
});
