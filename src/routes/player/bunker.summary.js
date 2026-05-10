// src/routes/player/bunker.summary.js

export function registerPlayerBunkerSummaryRoute(app, { requirePlayer }) {
  app.get("/player/bunker/summary", async (req, res) => {
    const authenticated = await requirePlayer(req, res);

    if (!authenticated) {
      return;
    }

    const player = req.player ?? {};

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data: {
        player: {
          playerAccountId: player.playerAccountId ?? null,
          steamid64: player.steamid64 ?? null,
          displayName: player.displayName ?? null,
        },
        bunker: {
          status: "skeleton",
          seasonFirst: true,
          statsAvailable: false,
        },
        currentSeason: null,
        lifetime: null,
        notes: [
          "bunker_summary_skeleton",
          "stats_contract_not_connected",
        ],
      },
    });
  });
}
