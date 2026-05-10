// src/middlewares/playerAuth.js
import { PLAYER_SESSION_COOKIE } from "../config/playerAuth.js";
import { findActivePlayerSessionByToken } from "../db/playerSessions.js";
import { parseCookieHeader } from "../utils/cookies.js";

export function createPlayerAuth({ dbConfig }) {
  async function resolvePlayer(req) {
    if (req.player) {
      return req.player;
    }

    const cookies = parseCookieHeader(req.headers.cookie);
    const rawToken = cookies[PLAYER_SESSION_COOKIE];

    if (!rawToken) {
      return null;
    }

    const session = await findActivePlayerSessionByToken(dbConfig, rawToken);
    if (!session) {
      return null;
    }

    req.player = {
      via: "session",
      sessionId: session.sessionId ?? null,
      playerAccountId: session.playerAccountId ?? null,
      steamid64: session.steamid64 ?? null,
      displayName: session.displayName ?? null,
      expiresAt: session.expiresAt ?? null,
    };

    return req.player;
  }

  async function requirePlayer(req, res) {
    const player = await resolvePlayer(req);

    if (!player) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return false;
    }

    return true;
  }

  return {
    resolvePlayer,
    requirePlayer,
  };
}
