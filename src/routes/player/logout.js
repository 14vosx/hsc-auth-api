// src/routes/player/logout.js
import { PLAYER_SESSION_COOKIE } from "../../config/playerAuth.js";
import {
  revokePlayerSessionByToken as defaultRevokePlayerSessionByToken,
} from "../../db/playerSessions.js";
import { parseCookieHeader } from "../../utils/cookies.js";
import { buildClearPlayerSessionCookie } from "../../utils/playerSessionCookie.js";

export function registerPlayerLogoutRoute(
  app,
  {
    dbConfig,
    revokePlayerSessionByToken,
  } = {},
) {
  const revokeSessionByToken =
    typeof revokePlayerSessionByToken === "function"
      ? (rawToken) => revokePlayerSessionByToken(dbConfig, rawToken)
      : (rawToken) => defaultRevokePlayerSessionByToken(dbConfig, rawToken);

  app.post("/player/auth/logout", async (req, res) => {
    const cookies = parseCookieHeader(req.headers?.cookie);
    const rawToken = cookies[PLAYER_SESSION_COOKIE];

    if (rawToken) {
      await revokeSessionByToken(rawToken);
    }

    res.setHeader("Set-Cookie", buildClearPlayerSessionCookie());

    return res.status(200).json({
      ok: true,
      loggedOut: true,
    });
  });
}
