import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { SeasonPlayerManifestService } from "../../../../src/nest/player/bunker/season-player-manifest.service.js";

function validManifest(overrides?: Record<string, unknown>) {
  return {
    generatedAt: "2026-08-01T00:00:00.000Z",
    season: {
      slug: "s1-2026",
      scope: {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      },
    },
    counts: {
      requested: 1,
      written: 1,
    },
    players: [
      {
        steamid64: "76561198000000001",
        name: "TestPlayer",
        path: "player/76561198000000001.json",
        summaryMaps: 5,
        summaryMatches: 3,
        score: null,
      },
    ],
    ...overrides,
  };
}

const VALID_STEAMID = "76561198000000001";
const VALID_SEASON = "s1-2026";

async function withTempRoot(
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-test-"));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeManifest(
  root: string,
  seasonSlug: string,
  content: string,
): Promise<void> {
  const dir = path.join(root, "season", seasonSlug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "players-manifest.json"),
    content,
    "utf8",
  );
}

// 1. manifest válido + SteamID listado → ok: true
test("season player manifest - valid manifest with listed SteamID returns ok true", async () => {
  await withTempRoot(async (root) => {
    await writeManifest(root, VALID_SEASON, JSON.stringify(validManifest()));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.manifest.generatedAt, "2026-08-01T00:00:00.000Z");
      assert.equal(result.manifest.seasonSlug, VALID_SEASON);
      assert.equal(result.manifest.scope.startAt, "2026-06-01T00:00:00.000Z");
      assert.equal(result.manifest.scope.endAt, "2026-09-01T00:00:00.000Z");
      assert.equal(result.manifest.requested, 1);
      assert.equal(result.manifest.written, 1);
    }
  });
});

// 2. root ausente → not_configured
test("season player manifest - empty root returns not_configured", async () => {
  const service = new SeasonPlayerManifestService();
  const result = await service.read({
    root: "",
    seasonSlug: VALID_SEASON,
    steamid64: VALID_STEAMID,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "not_configured");
  }
});

// 3. SteamID inválido → invalid_steamid64
test("season player manifest - invalid SteamID returns invalid_steamid64", async () => {
  const service = new SeasonPlayerManifestService();

  for (const bad of [null, "", "abc", "1234567890", "7656119800000000x"]) {
    const result = await service.read({
      root: "/tmp/fake-root",
      seasonSlug: VALID_SEASON,
      steamid64: bad,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_steamid64", `failed for: ${bad}`);
    }
  }
});

// 4. Season slug inválido → invalid_season_slug
test("season player manifest - invalid season slug returns invalid_season_slug", async () => {
  const service = new SeasonPlayerManifestService();

  for (const bad of ["", "S1 2026", "../traversal", "a/b", "hello world"]) {
    const result = await service.read({
      root: "/tmp/fake-root",
      seasonSlug: bad,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_season_slug", `failed for: ${bad}`);
    }
  }
});

// 5. arquivo inexistente → not_found
test("season player manifest - missing file returns not_found", async () => {
  await withTempRoot(async (root) => {
    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_found");
    }
  });
});

// 6. JSON inválido → invalid_json
test("season player manifest - invalid JSON returns invalid_json", async () => {
  await withTempRoot(async (root) => {
    await writeManifest(root, VALID_SEASON, "not-valid-json{{{");

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_json");
    }
  });
});

// 7. root JSON não-objeto → invalid_manifest
test("season player manifest - non-object JSON root returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    for (const content of [
      JSON.stringify([1, 2, 3]),
      JSON.stringify(null),
      JSON.stringify("string"),
      JSON.stringify(42),
      JSON.stringify(true),
    ]) {
      await writeManifest(root, VALID_SEASON, content);

      const service = new SeasonPlayerManifestService();
      const result = await service.read({
        root,
        seasonSlug: VALID_SEASON,
        steamid64: VALID_STEAMID,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.reason,
          "invalid_manifest",
          `failed for: ${content}`,
        );
      }
    }
  });
});

// 8. Season divergente → season_mismatch
test("season player manifest - season slug mismatch returns season_mismatch", async () => {
  await withTempRoot(async (root) => {
    const manifest = validManifest({
      season: {
        slug: "s2-2026",
        scope: {
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
      },
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "season_mismatch");
    }
  });
});

// 9. counts.requested inválido
test("season player manifest - invalid counts.requested returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    for (const badRequested of [-1, 1.5, "one", null, undefined]) {
      const manifest = validManifest({
        counts: { requested: badRequested, written: 1 },
      });

      await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

      const service = new SeasonPlayerManifestService();
      const result = await service.read({
        root,
        seasonSlug: VALID_SEASON,
        steamid64: VALID_STEAMID,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.reason,
          "invalid_manifest",
          `failed for requested=${JSON.stringify(badRequested)}`,
        );
      }
    }
  });
});

// 10. counts.written inválido
test("season player manifest - invalid counts.written returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    for (const badWritten of [-1, 1.5, "one", null, undefined]) {
      const manifest = validManifest({
        counts: { requested: 1, written: badWritten },
      });

      await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

      const service = new SeasonPlayerManifestService();
      const result = await service.read({
        root,
        seasonSlug: VALID_SEASON,
        steamid64: VALID_STEAMID,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.reason,
          "invalid_manifest",
          `failed for written=${JSON.stringify(badWritten)}`,
        );
      }
    }
  });
});

// 11. requested != written
test("season player manifest - requested not equal to written returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const manifest = validManifest({
      counts: { requested: 2, written: 1 },
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

// 12. written != players.length
test("season player manifest - written not equal to players length returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const manifest = validManifest({
      counts: { requested: 2, written: 2 },
    });
    // players still has only 1 entry

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

// 13. SteamID solicitado ausente → player_not_listed
test("season player manifest - requested SteamID not in players returns player_not_listed", async () => {
  await withTempRoot(async (root) => {
    await writeManifest(root, VALID_SEASON, JSON.stringify(validManifest()));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: "76561198000000099",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "player_not_listed");
    }
  });
});

// 14. item com SteamID inválido → invalid_manifest
test("season player manifest - player entry with invalid SteamID returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const manifest = validManifest({
      players: [
        {
          steamid64: "not-a-steamid",
          name: "Bad",
          path: "player/bad.json",
          summaryMaps: 0,
          summaryMatches: 0,
          score: null,
        },
      ],
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

// 15. SteamID duplicado → invalid_manifest
test("season player manifest - duplicate SteamID in players returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const player = {
      steamid64: VALID_STEAMID,
      name: "TestPlayer",
      path: `player/${VALID_STEAMID}.json`,
      summaryMaps: 5,
      summaryMatches: 3,
      score: null,
    };

    const manifest = validManifest({
      counts: { requested: 2, written: 2 },
      players: [player, { ...player }],
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

// 16. tentativa de Season/path traversal bloqueada
test("season player manifest - path traversal in season slug is blocked", async () => {
  const service = new SeasonPlayerManifestService();

  // These should be caught by the slug regex before hitting the filesystem
  for (const traversal of [
    "../../../etc",
    "..%2f..%2fetc",
    "valid/../../../etc",
  ]) {
    const result = await service.read({
      root: "/tmp/fake-root",
      seasonSlug: traversal,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.reason,
        "invalid_season_slug",
        `failed for: ${traversal}`,
      );
    }
  }
});

// 17. players[].path malicioso não é utilizado para acessar filesystem
test("season player manifest - malicious players[].path does not trigger filesystem access", async () => {
  await withTempRoot(async (root) => {
    // Create a sentinel file that should never be read
    const sentinelDir = path.join(root, "sentinel");
    await fs.mkdir(sentinelDir, { recursive: true });
    const sentinelPath = path.join(sentinelDir, "secret.txt");
    await fs.writeFile(sentinelPath, "SECRET_DATA", "utf8");

    const manifest = validManifest({
      players: [
        {
          steamid64: VALID_STEAMID,
          name: "Attacker",
          path: "../../../../etc/passwd",
          summaryMaps: 0,
          summaryMatches: 0,
          score: null,
        },
      ],
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    // The service should succeed because the manifest is structurally valid.
    // The malicious path value is irrelevant — it is never used for filesystem access.
    assert.equal(result.ok, true);

    // Also test with an absolute path in players[].path
    const manifest2 = validManifest({
      players: [
        {
          steamid64: VALID_STEAMID,
          name: "Attacker2",
          path: "/etc/passwd",
          summaryMaps: 0,
          summaryMatches: 0,
          score: null,
        },
      ],
    });

    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest2));

    const result2 = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    // Still succeeds — path field is completely ignored by the service
    assert.equal(result2.ok, true);

    // Sentinel file is still intact (proves no write happened either)
    const sentinel = await fs.readFile(sentinelPath, "utf8");
    assert.equal(sentinel, "SECRET_DATA");
  });
});

// Additional structural validation tests

test("season player manifest - missing generatedAt returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const { generatedAt: _, ...manifest } = validManifest();
    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

test("season player manifest - missing season object returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const { season: _, ...manifest } = validManifest();
    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

test("season player manifest - missing counts returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const { counts: _, ...manifest } = validManifest();
    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

test("season player manifest - missing players array returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    const { players: _, ...manifest } = validManifest();
    await writeManifest(root, VALID_SEASON, JSON.stringify(manifest));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

test("season player manifest - ok result does not contain players path field", async () => {
  await withTempRoot(async (root) => {
    await writeManifest(root, VALID_SEASON, JSON.stringify(validManifest()));

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      const manifestKeys = Object.keys(result.manifest);
      assert.equal(manifestKeys.includes("path"), false);
      assert.equal(manifestKeys.includes("players"), false);
    }
  });
});

// Hardening: SteamID64 as JSON number must be rejected
test("season player manifest - numeric steamid64 in player entry returns invalid_manifest", async () => {
  await withTempRoot(async (root) => {
    // Build the JSON string manually so that steamid64 is a number after JSON.parse
    const manifest = {
      generatedAt: "2026-08-01T00:00:00.000Z",
      season: {
        slug: VALID_SEASON,
        scope: {
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
      },
      counts: { requested: 1, written: 1 },
      players: [
        {
          steamid64: 76561198000000001,
          name: "NumericId",
          path: "player/76561198000000001.json",
          summaryMaps: 0,
          summaryMatches: 0,
          score: null,
        },
      ],
    };

    // Confirm that JSON round-trip produces a number, not a string
    const raw = JSON.stringify(manifest);
    const reparsed = JSON.parse(raw) as Record<string, unknown>;
    const players = reparsed.players as Array<Record<string, unknown>>;
    assert.equal(typeof players[0].steamid64, "number");

    await writeManifest(root, VALID_SEASON, raw);

    const service = new SeasonPlayerManifestService();
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_manifest");
    }
  });
});

// Hardening: whitespace-only root → not_configured
test("season player manifest - whitespace-only root returns not_configured", async () => {
  const service = new SeasonPlayerManifestService();

  for (const root of ["   ", "\t", "\n", "  \t\n  "]) {
    const result = await service.read({
      root,
      seasonSlug: VALID_SEASON,
      steamid64: VALID_STEAMID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.reason,
        "not_configured",
        `failed for root=${JSON.stringify(root)}`,
      );
    }
  }
});

// Hardening: unexpected filesystem error is propagated, not masked as not_found
test("season player manifest - unexpected filesystem error is propagated not masked", async () => {
  await withTempRoot(async (root) => {
    // Create players-manifest.json as a directory instead of a file.
    // readFile on a directory produces EISDIR (or equivalent), not ENOENT.
    const manifestDir = path.join(root, "season", VALID_SEASON);
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.mkdir(path.join(manifestDir, "players-manifest.json"));

    const service = new SeasonPlayerManifestService();

    await assert.rejects(
      () =>
        service.read({
          root,
          seasonSlug: VALID_SEASON,
          steamid64: VALID_STEAMID,
        }),
      (error: unknown) => {
        // Must be a real error, not silently mapped to not_found
        assert.ok(error instanceof Error);
        return true;
      },
    );
  });
});
