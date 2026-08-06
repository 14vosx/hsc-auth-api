// src/routes/player/bunker.summary.js
import { buildPlayerBunkerConfig } from "../../config/playerBunker.js";
import { readCompetitiveProfile as readCompetitiveProfileDefault } from "../../services/player-bunker/competitiveProfile.js";
import { readSeasonPlayerArtifact as readSeasonPlayerArtifactDefault } from "../../services/player-bunker/seasonPlayerArtifact.js";

const SENSITIVE_ARTIFACT_KEY_RE = /(token|cookie|hash)/i;

function sanitizeArtifact(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArtifact(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_ARTIFACT_KEY_RE.test(key))
      .map(([key, item]) => [key, sanitizeArtifact(item)]),
  );
}

function buildPlayerData({ player, competitiveProfile }) {
  const displayName = player.displayName ?? competitiveProfile?.name ?? null;
  const avatarMedium = player.avatarMedium ?? competitiveProfile?.avatarMedium ?? null;
  const steamProfileUrl = player.steamProfileUrl ?? competitiveProfile?.steamProfileUrl ?? null;

  return {
    playerAccountId: player.playerAccountId ?? null,
    steamid64: player.steamid64 ?? null,
    displayName,
    ...(avatarMedium ? { avatarMedium } : {}),
    ...(steamProfileUrl ? { steamProfileUrl } : {}),
  };
}

function buildCompetitiveProfileNotes({ competitiveProfileResult }) {
  if (competitiveProfileResult.ok) {
    return ["competitive_profile_connected"];
  }

  if (competitiveProfileResult.reason !== "not_configured") {
    return ["competitive_profile_unavailable"];
  }

  return [];
}

function toPublicDate(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? null;
}

function buildActiveSeasonCurrentSeason(activeSeason) {
  if (!activeSeason) {
    return null;
  }

  return {
    slug: activeSeason.slug,
    name: activeSeason.name,
    status: activeSeason.status,
    scope: {
      startAt: toPublicDate(activeSeason.start_at),
      endAt: toPublicDate(activeSeason.end_at),
    },
  };
}

async function getActiveSeasonState(seasonsRepo) {
  if (typeof seasonsRepo?.getActiveSeason !== "function") {
    return { available: false, activeSeason: null };
  }

  try {
    return {
      available: true,
      activeSeason: (await seasonsRepo.getActiveSeason()) ?? null,
    };
  } catch {
    return { available: false, activeSeason: null };
  }
}

function artifactSeasonSlugDiffers({ artifact, activeSeason }) {
  const artifactSeasonSlug = artifact?.season?.slug;
  return artifactSeasonSlug != null && artifactSeasonSlug !== activeSeason.slug;
}

function buildFallbackData({
  player,
  note,
  competitiveProfileResult,
  activeSeason,
}) {
  const competitiveProfile = competitiveProfileResult.ok
    ? competitiveProfileResult.profile
    : null;

  return {
    player: buildPlayerData({ player, competitiveProfile }),
    bunker: {
      status: player.steamid64 ? "ready" : "unavailable",
      seasonFirst: true,
      statsAvailable: false,
    },
    currentSeason: buildActiveSeasonCurrentSeason(activeSeason),
    lifetime: null,
    competitiveProfile,
    notes: [
      "real_player_identity_connected",
      note,
      ...buildCompetitiveProfileNotes({ competitiveProfileResult }),
    ],
  };
}

function buildReadyData({
  player,
  artifact,
  competitiveProfileResult,
  activeSeason,
}) {
  const seasonPlayer = sanitizeArtifact(artifact);
  const competitiveProfile = competitiveProfileResult.ok
    ? competitiveProfileResult.profile
    : null;

  return {
    player: buildPlayerData({ player, competitiveProfile }),
    bunker: {
      status: "ready",
      seasonFirst: true,
      statsAvailable: true,
    },
    currentSeason: buildActiveSeasonCurrentSeason(activeSeason),
    lifetime: null,
    seasonPlayer,
    competitiveProfile,
    notes: [
      "real_player_identity_connected",
      "season_player_artifact_connected",
      ...buildCompetitiveProfileNotes({ competitiveProfileResult }),
    ],
  };
}

export function registerPlayerBunkerSummaryRoute(
  app,
  {
    requirePlayer,
    seasonsRepo = null,
    readSeasonPlayerArtifactFn = readSeasonPlayerArtifactDefault,
    readCompetitiveProfileFn = readCompetitiveProfileDefault,
    playerBunkerConfig = buildPlayerBunkerConfig(),
  },
) {
  app.get("/player/bunker/summary", async (req, res) => {
    const authenticated = await requirePlayer(req, res);

    if (!authenticated) {
      return;
    }

    const player = req.player ?? {};
    let data;
    const activeSeasonState = await getActiveSeasonState(seasonsRepo);
    const activeSeason = activeSeasonState.activeSeason;
    const competitiveProfileResult = await readCompetitiveProfileFn({
      baseUrl: playerBunkerConfig.staticApiBaseUrl,
      timeoutMs: playerBunkerConfig.staticApiTimeoutMs,
      steamid64: player.steamid64,
    });

    if (!activeSeasonState.available) {
      data = buildFallbackData({
        player,
        note: "active_season_unavailable",
        competitiveProfileResult,
        activeSeason: null,
      });
    } else if (!activeSeason) {
      data = buildFallbackData({
        player,
        note: "no_active_season",
        competitiveProfileResult,
        activeSeason: null,
      });
    } else if (
      playerBunkerConfig.activeSeasonSlug &&
      playerBunkerConfig.activeSeasonSlug !== activeSeason.slug
    ) {
      data = buildFallbackData({
        player,
        note: "season_artifact_slug_mismatch",
        competitiveProfileResult,
        activeSeason,
      });
    } else {
      try {
        const result = await readSeasonPlayerArtifactFn({
          root: playerBunkerConfig.artifactRoot,
          seasonSlug: activeSeason.slug,
          steamid64: player.steamid64,
        });

        if (
          result.ok &&
          artifactSeasonSlugDiffers({ artifact: result.artifact, activeSeason })
        ) {
          data = buildFallbackData({
            player,
            note: "season_artifact_slug_mismatch",
            competitiveProfileResult,
            activeSeason,
          });
        } else if (result.ok) {
          data = buildReadyData({
            player,
            artifact: result.artifact,
            competitiveProfileResult,
            activeSeason,
          });
        } else if (
          result.reason === "not_configured" ||
          result.reason === "not_found"
        ) {
          data = buildFallbackData({
            player,
            note: result.reason,
            competitiveProfileResult,
            activeSeason,
          });
        } else {
          data = buildFallbackData({
            player,
            note: "season_player_artifact_unavailable",
            competitiveProfileResult,
            activeSeason,
          });
        }
      } catch {
        data = buildFallbackData({
          player,
          note: "season_player_artifact_unavailable",
          competitiveProfileResult,
          activeSeason,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data,
    });
  });
}
