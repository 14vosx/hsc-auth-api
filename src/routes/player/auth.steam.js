// src/routes/player/auth.steam.js
import { PLAYER_STEAM_AUTH_ENABLED } from "../../config/playerSteamAuth.js";
import { resolveOrCreatePlayerAccountFromSteamId } from "../../db/playerAccounts.js";
import {
  buildSteamAuthUnavailablePayload,
  buildSteamOpenIdStartUrl,
  verifySteamOpenIdCallback,
} from "../../services/player-auth/steamAuth.js";

export function registerPlayerSteamAuthRoutes(app, { getDbReady, dbConfig }) {
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

    const accountResult = await resolveOrCreatePlayerAccountFromSteamId(
      dbConfig,
      result.steamid64,
    );

    if (!accountResult.ok) {
      return res.status(500).json({
        ok: false,
        error: accountResult.error || "player_account_resolve_failed",
      });
    }

    if (accountResult.status === "disabled") {
      return res.status(403).json({
        ok: false,
        error: "player_account_disabled",
        verified: true,
        steamid64: result.steamid64,
      });
    }

    return res.status(501).json({
      ok: false,
      error: "steam_session_not_implemented",
      verified: true,
      steamid64: result.steamid64,
      playerAccountId: accountResult.playerAccountId,
      accountCreated: accountResult.accountCreated,
      identityCreated: accountResult.identityCreated,
    });
  });
}
