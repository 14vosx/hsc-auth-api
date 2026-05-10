// src/routes/player/me.js

export function registerPlayerMeRoute(app, { requirePlayer }) {
  app.get("/player/me", async (req, res) => {
    const authenticated = await requirePlayer(req, res);

    if (!authenticated) {
      return;
    }

    const player = req.player ?? {};

    return res.status(200).json({
      ok: true,
      authenticated: true,
      player: {
        playerAccountId: player.playerAccountId ?? null,
        steamid64: player.steamid64 ?? null,
        displayName: player.displayName ?? null,
        sessionId: player.sessionId ?? null,
        expiresAt: player.expiresAt ?? null,
      },
    });
  });
}
