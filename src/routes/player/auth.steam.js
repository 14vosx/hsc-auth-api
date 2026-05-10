// src/routes/player/auth.steam.js
import { PLAYER_STEAM_AUTH_ENABLED } from "../../config/playerSteamAuth.js";
import {
  buildSteamAuthUnavailablePayload,
  buildSteamOpenIdStartUrl,
  verifySteamOpenIdCallback,
} from "../../services/player-auth/steamAuth.js";

export function registerPlayerSteamAuthRoutes(app, { getDbReady }) {
  app.get("/player/auth/steam/start", async (req, res) => {
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    if (!PLAYER_STEAM_AUTH_ENABLED) {
      return res.status(501).json(buildSteamAuthUnavailablePayload());
    }

    return res.redirect(buildSteamOpenIdStartUrl());
  });

  app.get("/player/auth/steam/callback", async (req, res) => {
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    if (!PLAYER_STEAM_AUTH_ENABLED) {
      return res.status(501).json(buildSteamAuthUnavailablePayload());
    }

    const result = await verifySteamOpenIdCallback(req.query);

    if (!result.ok) {
      return res
        .status(400)
        .json({ ok: false, error: result.error || "steam_openid_invalid" });
    }

    return res.status(501).json({
      ok: false,
      error: "steam_session_not_implemented",
      verified: true,
      steamid64: result.steamid64,
    });
  });
}
