// src/routes/player/bunker.summary.js
import {
  PLAYER_BUNKER_ACTIVE_SEASON_SLUG,
  PLAYER_BUNKER_ARTIFACT_ROOT,
  PLAYER_BUNKER_STATIC_API_BASE_URL,
  PLAYER_BUNKER_STATIC_API_TIMEOUT_MS,
} from "../../config/playerBunker.js";
import { readCompetitiveProfile } from "../../services/player-bunker/competitiveProfile.js";
import { readSeasonPlayerArtifact } from "../../services/player-bunker/seasonPlayerArtifact.js";

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
  return {
    playerAccountId: player.playerAccountId ?? null,
    steamid64: player.steamid64 ?? null,
    displayName: player.displayName ?? null,
    ...(competitiveProfile?.avatarMedium
      ? { avatarMedium: competitiveProfile.avatarMedium }
      : {}),
    ...(competitiveProfile?.steamProfileUrl
      ? { steamProfileUrl: competitiveProfile.steamProfileUrl }
      : {}),
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

function buildFallbackData({ player, note, competitiveProfileResult }) {
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
    currentSeason: null,
    lifetime: null,
    competitiveProfile,
    notes: [
      "real_player_identity_connected",
      note,
      ...buildCompetitiveProfileNotes({ competitiveProfileResult }),
    ],
  };
}

function buildReadyData({ player, artifact, competitiveProfileResult }) {
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
    currentSeason: seasonPlayer?.season ?? null,
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

export function registerPlayerBunkerSummaryRoute(app, { requirePlayer }) {
  app.get("/player/bunker/summary", async (req, res) => {
    const authenticated = await requirePlayer(req, res);

    if (!authenticated) {
      return;
    }

    const player = req.player ?? {};
    let data;
    const competitiveProfileResult = await readCompetitiveProfile({
      baseUrl: PLAYER_BUNKER_STATIC_API_BASE_URL,
      timeoutMs: PLAYER_BUNKER_STATIC_API_TIMEOUT_MS,
      steamid64: player.steamid64,
    });

    try {
      const result = await readSeasonPlayerArtifact({
        root: PLAYER_BUNKER_ARTIFACT_ROOT,
        seasonSlug: PLAYER_BUNKER_ACTIVE_SEASON_SLUG,
        steamid64: player.steamid64,
      });

      if (result.ok) {
        data = buildReadyData({
          player,
          artifact: result.artifact,
          competitiveProfileResult,
        });
      } else if (result.reason === "not_configured" || result.reason === "not_found") {
        data = buildFallbackData({
          player,
          note: result.reason,
          competitiveProfileResult,
        });
      } else {
        data = buildFallbackData({
          player,
          note: "season_player_artifact_unavailable",
          competitiveProfileResult,
        });
      }
    } catch {
      data = buildFallbackData({
        player,
        note: "season_player_artifact_unavailable",
        competitiveProfileResult,
      });
    }

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data,
    });
  });
}
