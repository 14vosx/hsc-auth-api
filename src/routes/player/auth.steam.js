// src/routes/player/auth.steam.js
import {
  PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED,
  PLAYER_AUTH_FAILURE_REDIRECT_URL,
  PLAYER_AUTH_SUCCESS_REDIRECT_URL,
  PLAYER_STEAM_AUTH_ENABLED,
} from "../../config/playerSteamAuth.js";
import { PLAYER_SESSION_TTL_HOURS } from "../../config/playerAuth.js";
import { resolveOrCreatePlayerAccountFromSteamId } from "../../db/playerAccounts.js";
import { createPlayerSessionForAccount } from "../../db/playerSessions.js";
import {
  buildSteamAuthUnavailablePayload,
  buildSteamOpenIdStartUrl,
  verifySteamOpenIdCallback,
} from "../../services/player-auth/steamAuth.js";
import { buildPlayerSessionCookie } from "../../utils/playerSessionCookie.js";

function shouldRedirectAfterPlayerAuth() {
  return PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED === true;
}

function redirectPlayerAuthFailure(res) {
  return res.redirect(PLAYER_AUTH_FAILURE_REDIRECT_URL);
}

function redirectPlayerAuthSuccess(res) {
  return res.redirect(PLAYER_AUTH_SUCCESS_REDIRECT_URL);
}

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
        PLAYER_SESSION_TTL_HOURS,
      );
    } catch {
      if (shouldRedirectAfterPlayerAuth()) {
        return redirectPlayerAuthFailure(res);
      }

      return res
        .status(500)
        .json({ ok: false, error: "player_session_issue_failed" });
    }

    res.setHeader("Set-Cookie", buildPlayerSessionCookie(session.rawToken));

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
