// src/routes/player/bunker.summary.js
import {
  PLAYER_BUNKER_ACTIVE_SEASON_SLUG,
  PLAYER_BUNKER_ARTIFACT_ROOT,
} from "../../config/playerBunker.js";
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

function buildFallbackData({ player, note }) {
  return {
    player: {
      playerAccountId: player.playerAccountId ?? null,
      steamid64: player.steamid64 ?? null,
      displayName: player.displayName ?? null,
    },
    bunker: {
      status: player.steamid64 ? "ready" : "unavailable",
      seasonFirst: true,
      statsAvailable: false,
    },
    currentSeason: null,
    lifetime: null,
    notes: [
      "real_player_identity_connected",
      note,
    ],
  };
}

function buildReadyData({ player, artifact }) {
  const seasonPlayer = sanitizeArtifact(artifact);

  return {
    player: {
      playerAccountId: player.playerAccountId ?? null,
      steamid64: player.steamid64 ?? null,
      displayName: player.displayName ?? null,
    },
    bunker: {
      status: "ready",
      seasonFirst: true,
      statsAvailable: true,
    },
    currentSeason: seasonPlayer?.season ?? null,
    lifetime: null,
    seasonPlayer,
    notes: [
      "real_player_identity_connected",
      "season_player_artifact_connected",
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
        });
      } else if (result.reason === "not_configured" || result.reason === "not_found") {
        data = buildFallbackData({
          player,
          note: result.reason,
        });
      } else {
        data = buildFallbackData({
          player,
          note: "season_player_artifact_unavailable",
        });
      }
    } catch {
      data = buildFallbackData({
        player,
        note: "season_player_artifact_unavailable",
      });
    }

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data,
    });
  });
}
