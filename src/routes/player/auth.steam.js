// src/routes/player/auth.steam.js
import { PLAYER_STEAM_AUTH_ENABLED } from "../../config/playerSteamAuth.js";
import {
  buildSteamAuthUnavailablePayload,
  buildSteamOpenIdStartUrl,
  readSteamCallbackQuery,
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

    readSteamCallbackQuery(req.query);

    return res
      .status(501)
      .json({ ok: false, error: "steam_callback_not_implemented" });
  });
}
