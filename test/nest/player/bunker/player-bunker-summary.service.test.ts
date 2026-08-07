import test from "node:test";
import assert from "node:assert/strict";

import { PlayerBunkerSummaryService } from "../../../../src/nest/player/bunker/player-bunker-summary.service.js";

const PLAYER = {
  via: "session" as const,
  sessionId: "session-1",
  playerAccountId: "account-1",
  steamid64: "76561198000000001",
  displayName: "Player One",
  avatarMedium: null,
  steamProfileUrl: null,
  expiresAt: "2026-08-08T00:00:00.000Z",
};

const ACTIVE_SEASON = {
  slug: "s1-2026",
  name: "Season 1",
  status: "active",
  start_at: "2026-06-01T00:00:00.000Z",
  end_at: "2026-09-01T00:00:00.000Z",
};

function createService(input: {
  manifestRead: (args: {
    root: string;
    seasonSlug: string;
    steamid64: string | null;
  }) => Promise<unknown>;
  artifactRead: (args: {
    root: string;
    seasonSlug: string;
    steamid64: string | null;
  }) => Promise<unknown>;
}) {
  const config = {
    playerBunker: {
      artifactRoot: "/tmp/hsc-player-bunker",
      activeSeasonSlug: ACTIVE_SEASON.slug,
      staticApiBaseUrl: "",
      staticApiTimeoutMs: 1500,
    },
  };

  const seasonsRepository = {
    async getActiveSeason() {
      return ACTIVE_SEASON;
    },
  };

  const manifestService = {
    read: input.manifestRead,
  };

  const artifactService = {
    read: input.artifactRead,
  };

  const competitiveProfileService = {
    async read() {
      return {
        ok: false as const,
        reason: "not_configured" as const,
      };
    },
  };

  return new PlayerBunkerSummaryService(
    config as any,
    seasonsRepository as any,
    manifestService as any,
    artifactService as any,
    competitiveProfileService as any,
  );
}

function asRecord(value: unknown): Record<string, any> {
  assert.ok(value && typeof value === "object");
  return value as Record<string, any>;
}

test("player bunker summary - manifest rejection prevents artifact read", async () => {
  let manifestReads = 0;
  let artifactReads = 0;

  const service = createService({
    async manifestRead(args) {
      manifestReads += 1;

      assert.equal(args.root, "/tmp/hsc-player-bunker");
      assert.equal(args.seasonSlug, ACTIVE_SEASON.slug);
      assert.equal(args.steamid64, PLAYER.steamid64);

      return {
        ok: false as const,
        reason: "player_not_listed" as const,
      };
    },

    async artifactRead() {
      artifactReads += 1;
      throw new Error("artifact must not be read");
    },
  });

  const result = asRecord(await service.build(PLAYER));

  assert.equal(manifestReads, 1);
  assert.equal(artifactReads, 0);

  assert.equal(result.bunker.statsAvailable, false);
  assert.equal(result.bunker.seasonFirst, true);
  assert.equal(result.currentSeason.slug, ACTIVE_SEASON.slug);

  assert.ok(result.notes.includes("not_found"));
  assert.ok(!result.notes.includes("season_player_artifact_connected"));
});

test("player bunker summary - valid manifest allows authenticated artifact read", async () => {
  let manifestReads = 0;
  let artifactReads = 0;
  let artifactSteamid: string | null = null;

  const service = createService({
    async manifestRead(args) {
      manifestReads += 1;

      assert.equal(args.steamid64, PLAYER.steamid64);

      return {
        ok: true as const,
        manifest: {
          generatedAt: "2026-08-07T12:00:00.000Z",
          seasonSlug: ACTIVE_SEASON.slug,
          scope: {
            startAt: ACTIVE_SEASON.start_at,
            endAt: ACTIVE_SEASON.end_at,
          },
          requested: 1,
          written: 1,
        },
      };
    },

    async artifactRead(args) {
      artifactReads += 1;
      artifactSteamid = args.steamid64;

      return {
        ok: true as const,
        artifact: {
          generatedAt: "2026-08-07T12:00:00.000Z",
          season: {
            slug: ACTIVE_SEASON.slug,
          },
          steamid64: PLAYER.steamid64,
          name: "Player One",
          summary: {
            matchesPlayed: 3,
          },
          periods: {},
          byMap: [],
          recentMaps: [],
          timeline: [],
        },
      };
    },
  });

  const result = asRecord(await service.build(PLAYER));

  assert.equal(manifestReads, 1);
  assert.equal(artifactReads, 1);
  assert.equal(artifactSteamid, PLAYER.steamid64);

  assert.equal(result.bunker.statsAvailable, true);
  assert.equal(result.bunker.seasonFirst, true);
  assert.equal(result.seasonPlayer.steamid64, PLAYER.steamid64);
  assert.equal(result.seasonPlayer.season.slug, ACTIVE_SEASON.slug);

  assert.ok(result.notes.includes("season_player_artifact_connected"));
});

test("player bunker summary - unexpected manifest error degrades safely", async () => {
  let artifactReads = 0;

  const service = createService({
    async manifestRead() {
      throw new Error("filesystem failure");
    },

    async artifactRead() {
      artifactReads += 1;
      throw new Error("artifact must not be read");
    },
  });

  const result = asRecord(await service.build(PLAYER));

  assert.equal(artifactReads, 0);
  assert.equal(result.bunker.statsAvailable, false);

  assert.ok(
    result.notes.includes("season_player_artifact_unavailable"),
  );
});


test("player bunker summary - exposes only ETL contract fields and strips nested sensitive keys", async () => {
  const service = createService({
    async manifestRead() {
      return {
        ok: true as const,
        manifest: {
          generatedAt: "2026-08-07T12:00:00.000Z",
          seasonSlug: ACTIVE_SEASON.slug,
          scope: {
            startAt: ACTIVE_SEASON.start_at,
            endAt: ACTIVE_SEASON.end_at,
          },
          requested: 1,
          written: 1,
        },
      };
    },

    async artifactRead() {
      return {
        ok: true as const,
        artifact: {
          generatedAt: "2026-08-07T12:00:00.000Z",
          season: {
            slug: ACTIVE_SEASON.slug,
            scope: {
              startAt: ACTIVE_SEASON.start_at,
              endAt: ACTIVE_SEASON.end_at,
            },
          },
          steamid64: PLAYER.steamid64,
          name: "Player One",
          summary: {
            matchesPlayed: 3,
            safeValue: "keep-me",
            sessionToken: "remove-me",
          },
          periods: {
            week: {
              score: 10,
              cookieValue: "remove-me",
            },
          },
          byMap: [],
          recentMaps: [],
          timeline: [
            {
              matchid: 123,
              internalHash: "remove-me",
            },
          ],

          localPath: "/var/tmp/internal.json",
          debug: true,
          secretMetadata: {
            shouldNotAppear: true,
          },
          token: "top-level-remove-me",
        },
      };
    },
  });

  const result = asRecord(await service.build(PLAYER));
  const seasonPlayer = asRecord(result.seasonPlayer);

  assert.deepEqual(
    Object.keys(seasonPlayer).sort(),
    [
      "byMap",
      "generatedAt",
      "name",
      "periods",
      "recentMaps",
      "season",
      "steamid64",
      "summary",
      "timeline",
    ].sort(),
  );

  assert.equal(seasonPlayer.localPath, undefined);
  assert.equal(seasonPlayer.debug, undefined);
  assert.equal(seasonPlayer.secretMetadata, undefined);
  assert.equal(seasonPlayer.token, undefined);

  assert.equal(seasonPlayer.summary.safeValue, "keep-me");
  assert.equal(seasonPlayer.summary.sessionToken, undefined);

  assert.equal(seasonPlayer.periods.week.score, 10);
  assert.equal(seasonPlayer.periods.week.cookieValue, undefined);

  assert.equal(seasonPlayer.timeline[0].matchid, 123);
  assert.equal(seasonPlayer.timeline[0].internalHash, undefined);
});
