import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CompetitiveProfileService } from "../../../../src/nest/player/bunker/competitive-profile.service.js";

const STEAMID = "76561198000000001";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "competitive-profile-"));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeProfile(root: string, value: string): Promise<void> {
  const directory = path.join(root, "competitive", "player");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${STEAMID}.json`), value, "utf8");
}

test("competitive profile - reads Auth-owned filesystem without fetch and sanitizes payload", async () => {
  await withRoot(async (root) => {
    await writeProfile(root, JSON.stringify({
      generatedAt: "2026-08-14T22:04:31.000Z",
      steamid64: STEAMID,
      name: "Player One",
      lifetime: { matchesPlayed: 10, sessionToken: "remove" },
      periods: { week: { score: 3, cookieValue: "remove" } },
      byMap: [], recentMaps: [], timeline: [],
      internalPath: "/private/path",
      payloadHash: "remove",
    }));
    const originalFetch = global.fetch;
    global.fetch = (() => { throw new Error("fetch must not be used"); }) as typeof fetch;
    try {
      const result = await new CompetitiveProfileService().read({ root, steamid64: STEAMID });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(Object.keys(result.profile).sort(), [
        "byMap", "generatedAt", "lifetime", "name", "periods",
        "recentMaps", "steamid64", "timeline",
      ].sort());
      assert.equal((result.profile.lifetime as any).sessionToken, undefined);
      assert.equal((result.profile.periods as any).week.cookieValue, undefined);
      assert.equal(result.profile.internalPath, undefined);
      assert.equal(result.profile.payloadHash, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("competitive profile - missing file returns not_found", async () => {
  await withRoot(async (root) => {
    assert.deepEqual(
      await new CompetitiveProfileService().read({ root, steamid64: STEAMID }),
      { ok: false, reason: "not_found" },
    );
  });
});

test("competitive profile - invalid JSON returns unavailable", async () => {
  await withRoot(async (root) => {
    await writeProfile(root, "{");
    assert.deepEqual(
      await new CompetitiveProfileService().read({ root, steamid64: STEAMID }),
      { ok: false, reason: "unavailable" },
    );
  });
});

test("competitive profile - payload steamid mismatch is rejected", async () => {
  await withRoot(async (root) => {
    await writeProfile(root, JSON.stringify({ steamid64: "76561198000000002" }));
    assert.deepEqual(
      await new CompetitiveProfileService().read({ root, steamid64: STEAMID }),
      { ok: false, reason: "steamid_mismatch" },
    );
  });
});
