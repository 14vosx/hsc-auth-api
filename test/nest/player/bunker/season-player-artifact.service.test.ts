import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SeasonPlayerArtifactService } from "../../../../src/nest/player/bunker/season-player-artifact.service.js";

const STEAMID = "76561198000000001";
const SEASON = "s1-2026";

function validArtifact(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-08-07T12:00:00.000Z",
    season: {
      slug: SEASON,
      scope: {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      },
    },
    steamid64: STEAMID,
    name: "Player One",
    summary: {},
    periods: {},
    byMap: [],
    recentMaps: [],
    timeline: [],
    ...overrides,
  };
}

async function withRoot(
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "season-player-artifact-"),
  );

  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeArtifact(
  root: string,
  content: string,
): Promise<void> {
  const dir = path.join(root, "season", SEASON, "player");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${STEAMID}.json`),
    content,
    "utf8",
  );
}

test("season player artifact - valid contract returns ok", async () => {
  await withRoot(async (root) => {
    await writeArtifact(root, JSON.stringify(validArtifact()));

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.artifact.steamid64, STEAMID);
    }
  });
});

test("season player artifact - whitespace root is not configured", async () => {
  const result = await new SeasonPlayerArtifactService().read({
    root: "   ",
    seasonSlug: SEASON,
    steamid64: STEAMID,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "not_configured",
  });
});

test("season player artifact - invalid JSON returns invalid_json", async () => {
  await withRoot(async (root) => {
    await writeArtifact(root, "{invalid");

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "invalid_json",
    });
  });
});

test("season player artifact - missing required field is invalid", async () => {
  await withRoot(async (root) => {
    const artifact = validArtifact();
    delete (artifact as Record<string, unknown>).summary;

    await writeArtifact(root, JSON.stringify(artifact));

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "invalid_artifact",
    });
  });
});

test("season player artifact - numeric SteamID is invalid", async () => {
  await withRoot(async (root) => {
    await writeArtifact(
      root,
      JSON.stringify(
        validArtifact({
          steamid64: 76561198000000001,
        }),
      ),
    );

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "invalid_artifact",
    });
  });
});

test("season player artifact - SteamID mismatch is rejected", async () => {
  await withRoot(async (root) => {
    await writeArtifact(
      root,
      JSON.stringify(
        validArtifact({
          steamid64: "76561198000000099",
        }),
      ),
    );

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "steamid_mismatch",
    });
  });
});

test("season player artifact - season mismatch is rejected", async () => {
  await withRoot(async (root) => {
    await writeArtifact(
      root,
      JSON.stringify(
        validArtifact({
          season: {
            slug: "s2-2026",
            scope: {
              startAt: "2026-06-01T00:00:00.000Z",
              endAt: "2026-09-01T00:00:00.000Z",
            },
          },
        }),
      ),
    );

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "season_mismatch",
    });
  });
});

test("season player artifact - stats collections require expected shapes", async () => {
  await withRoot(async (root) => {
    await writeArtifact(
      root,
      JSON.stringify(
        validArtifact({
          byMap: {},
        }),
      ),
    );

    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "invalid_artifact",
    });
  });
});

test("season player artifact - missing file returns not_found", async () => {
  await withRoot(async (root) => {
    const result = await new SeasonPlayerArtifactService().read({
      root,
      seasonSlug: SEASON,
      steamid64: STEAMID,
    });

    assert.deepEqual(result, {
      ok: false,
      reason: "not_found",
    });
  });
});
