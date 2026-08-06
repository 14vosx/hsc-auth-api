// src/routes/player/logout.js
import { buildPlayerAuthConfig } from "../../config/playerAuth.js";
import { buildAuthConfig } from "../../config/auth.js";
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
    playerAuthConfig = buildPlayerAuthConfig(),
    authConfig = buildAuthConfig(),
  } = {},
) {
  const revokeSessionByToken =
    typeof revokePlayerSessionByToken === "function"
      ? (rawToken) => revokePlayerSessionByToken(dbConfig, rawToken)
      : (rawToken) => defaultRevokePlayerSessionByToken(dbConfig, rawToken);

  app.post("/player/auth/logout", async (req, res) => {
    const cookies = parseCookieHeader(req.headers?.cookie);
    const cookieName = playerAuthConfig.cookieName || "hsc_player_session";
    const rawToken = cookies[cookieName];

    if (rawToken) {
      await revokeSessionByToken(rawToken);
    }

    res.setHeader(
      "Set-Cookie",
      buildClearPlayerSessionCookie(playerAuthConfig, authConfig.publicUrl),
    );

    return res.status(200).json({
      ok: true,
      loggedOut: true,
    });
  });
}
