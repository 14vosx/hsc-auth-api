// src/routes/player/auth.steam.js
import { buildPlayerSteamAuthConfig } from "../../config/playerSteamAuth.js";
import { buildPlayerAuthConfig } from "../../config/playerAuth.js";
import { buildAuthConfig } from "../../config/auth.js";
import {
  resolveOrCreatePlayerAccountFromSteamId as resolveOrCreatePlayerAccountFromSteamIdDefault,
} from "../../db/playerAccounts.js";
import {
  createPlayerSessionForAccount as createPlayerSessionForAccountDefault,
} from "../../db/playerSessions.js";
import {
  buildSteamAuthUnavailablePayload,
  buildSteamOpenIdStartUrl,
  verifySteamOpenIdCallback as verifySteamOpenIdCallbackDefault,
} from "../../services/player-auth/steamAuth.js";
import { buildPlayerSessionCookie } from "../../utils/playerSessionCookie.js";

export function registerPlayerSteamAuthRoutes(
  app,
  {
    getDbReady,
    dbConfig,
    playerSteamAuthConfig = buildPlayerSteamAuthConfig(),
    playerAuthConfig = buildPlayerAuthConfig(),
    authConfig = buildAuthConfig(),
    verifySteamOpenIdCallback = verifySteamOpenIdCallbackDefault,
    resolveOrCreatePlayerAccountFromSteamId =
      resolveOrCreatePlayerAccountFromSteamIdDefault,
    createPlayerSessionForAccount = createPlayerSessionForAccountDefault,
  },
) {
  function shouldRedirectAfterPlayerAuth() {
    return playerSteamAuthConfig.callbackRedirectEnabled === true;
  }

  function redirectPlayerAuthFailure(res) {
    return res.redirect(playerSteamAuthConfig.failureRedirectUrl);
  }

  function redirectPlayerAuthSuccess(res) {
    return res.redirect(playerSteamAuthConfig.successRedirectUrl);
  }

  app.get("/player/auth/steam/start", async (req, res) => {
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    if (!playerSteamAuthConfig.enabled) {
      return res.status(501).json(buildSteamAuthUnavailablePayload());
    }

    return res.redirect(buildSteamOpenIdStartUrl(playerSteamAuthConfig));
  });

  app.get("/player/auth/steam/callback", async (req, res) => {
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    if (!playerSteamAuthConfig.enabled) {
      return res.status(501).json(buildSteamAuthUnavailablePayload());
    }

    const result = await verifySteamOpenIdCallback(req.query, {
      playerSteamAuthConfig,
    });

    if (!result.ok) {
      if (shouldRedirectAfterPlayerAuth()) {
        return redirectPlayerAuthFailure(res);
      }

      return res
        .status(400)
        .json({ ok: false, error: result.error || "steam_openid_invalid" });
    }

    const accountResult = await resolveOrCreatePlayerAccountFromSteamId(
      dbConfig,
      result.steamid64,
    );

    if (!accountResult.ok) {
      if (shouldRedirectAfterPlayerAuth()) {
        return redirectPlayerAuthFailure(res);
      }

      return res.status(500).json({
        ok: false,
        error: accountResult.error || "player_account_resolve_failed",
      });
    }

    if (accountResult.status === "disabled") {
      if (shouldRedirectAfterPlayerAuth()) {
        return redirectPlayerAuthFailure(res);
      }

      return res.status(403).json({
        ok: false,
        error: "player_account_disabled",
        verified: true,
        steamid64: result.steamid64,
      });
    }

    let session;
    try {
      session = await createPlayerSessionForAccount(
        dbConfig,
        accountResult.playerAccountId,
        playerAuthConfig.ttlHours,
      );
    } catch {
      if (shouldRedirectAfterPlayerAuth()) {
        return redirectPlayerAuthFailure(res);
      }

      return res
        .status(500)
        .json({ ok: false, error: "player_session_issue_failed" });
    }

    res.setHeader(
      "Set-Cookie",
      buildPlayerSessionCookie(session.rawToken, playerAuthConfig, authConfig.publicUrl),
    );

    if (shouldRedirectAfterPlayerAuth()) {
      return redirectPlayerAuthSuccess(res);
    }

    return res.status(200).json({
      ok: true,
      authenticated: true,
      verified: true,
      steamid64: result.steamid64,
      player: {
        playerAccountId: accountResult.playerAccountId,
        steamid64: result.steamid64,
        displayName: accountResult.displayName ?? null,
      },
      session: {
        issued: true,
      },
      accountCreated: accountResult.accountCreated,
      identityCreated: accountResult.identityCreated,
    });
  });
}
