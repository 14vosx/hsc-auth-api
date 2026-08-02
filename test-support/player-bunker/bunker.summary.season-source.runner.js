import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SYNTHETIC_STEAMID64 = "76561190000000000";
const ENV_KEYS = [
  "PLAYER_BUNKER_ARTIFACT_ROOT",
  "PLAYER_BUNKER_ACTIVE_SEASON_SLUG",
  "PLAYER_BUNKER_STATIC_API_BASE_URL",
  "PLAYER_BUNKER_STATIC_API_TIMEOUT_MS",
];

function activeSeason(slug, name) {
  return {
    slug,
    name,
    status: "active",
    start_at: new Date("2026-08-01T12:00:00.000Z"),
    end_at: new Date("2026-09-01T12:00:00.000Z"),
  };
}

const SCENARIOS = {
  "no-active-season": {
    envSeasonSlug: "season-old",
    activeSeason: null,
    artifactPathSlug: "season-old",
    shortCircuit: true,
  },
  "env-active-mismatch": {
    envSeasonSlug: "season-old",
    activeSeason: activeSeason("season-new", "Season New"),
    artifactPathSlug: "season-old",
    shortCircuit: true,
  },
  "active-season-unavailable": {
    envSeasonSlug: "season-old",
    activeSeason: null,
    activeSeasonError: true,
    artifactPathSlug: "season-old",
    shortCircuit: true,
  },
  "artifact-slug-mismatch": {
    envSeasonSlug: "season-active",
    activeSeason: activeSeason("season-active", "Season Active"),
    artifactPathSlug: "season-active",
    artifactSeasonSlug: "season-other",
  },
  "active-season-without-env": {
    activeSeason: activeSeason("season-active", "Season Active"),
    artifactPathSlug: "season-active",
    artifactSeasonSlug: "season-active",
  },
};

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function writeSeasonArtifact({ root, pathSlug, artifactSlug }) {
  const playerDirectory = path.join(root, "season", pathSlug, "player");
  await mkdir(playerDirectory, { recursive: true });
  await writeFile(
    path.join(playerDirectory, `${SYNTHETIC_STEAMID64}.json`),
    JSON.stringify({
      season: {
        slug: artifactSlug,
        name: "Artifact Season",
        status: "archived",
        artifactOnly: true,
      },
      stats: { matches: 9, wins: 4 },
    }),
    "utf8",
  );
}

async function runScenario(scenarioName) {
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) throw new Error("unknown_scenario");

  const previousEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const root = await mkdtemp(path.join(tmpdir(), "hsc-player-bunker-season-"));

  try {
    process.env.PLAYER_BUNKER_ARTIFACT_ROOT = root;
    if (Object.hasOwn(scenario, "envSeasonSlug")) {
      process.env.PLAYER_BUNKER_ACTIVE_SEASON_SLUG = scenario.envSeasonSlug;
    } else {
      delete process.env.PLAYER_BUNKER_ACTIVE_SEASON_SLUG;
    }
    delete process.env.PLAYER_BUNKER_STATIC_API_BASE_URL;
    delete process.env.PLAYER_BUNKER_STATIC_API_TIMEOUT_MS;

    await writeSeasonArtifact({
      root,
      pathSlug: scenario.artifactPathSlug,
      artifactSlug: scenario.artifactSeasonSlug || scenario.artifactPathSlug,
    });

    const { registerPlayerBunkerSummaryRoute } = await import(
      "../../src/routes/player/bunker.summary.js"
    );
    const { readSeasonPlayerArtifact } = await import(
      "../../src/services/player-bunker/seasonPlayerArtifact.js"
    );
    const handlers = new Map();
    const app = {
      get(routePath, handler) {
        handlers.set(`GET ${routePath}`, handler);
      },
    };
    let artifactReadCalls = 0;
    const readSeasonPlayerArtifactFn = async (input) => {
      artifactReadCalls += 1;
      if (scenario.shortCircuit) throw new Error("unexpected_artifact_read");
      return readSeasonPlayerArtifact(input);
    };

    registerPlayerBunkerSummaryRoute(app, {
      requirePlayer: async () => true,
      seasonsRepo: {
        async getActiveSeason() {
          if (scenario.activeSeasonError) throw new Error("active_season_unavailable");
          return scenario.activeSeason;
        },
      },
      readSeasonPlayerArtifactFn,
    });

    const req = {
      player: {
        playerAccountId: 101,
        steamid64: SYNTHETIC_STEAMID64,
        displayName: "Synthetic Player",
      },
    };
    const res = createResponse();
    await handlers.get("GET /player/bunker/summary")(req, res);
    return { statusCode: res.statusCode, data: res.body?.data, artifactReadCalls };
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}

runScenario(process.argv[2])
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
  })
  .catch(() => {
    process.stderr.write("scenario_harness_failed");
    process.exitCode = 1;
  });
