// src/routes/content/seasons.js

export function registerContentSeasonsRoutes(app, { seasonsRepo,
	sendPublic,
	sendBadRequest,
	sendNotFound,
	normalizeSlug,
	getDbReady }) {
	// GET /content/seasons
	app.get("/content/seasons", async (_req, res) => {
		if (!getDbReady())
			return res.status(503).json({ ok: false, error: "db_not_ready" });

		try {
			const rows = await seasonsRepo.listSeasons();
			return sendPublic(res, rows);
		} catch (err) {
			return res.status(500).json({ ok: false, error: err.message });
		}
	});

	// GET /content/seasons/active
	app.get("/content/seasons/active", async (_req, res) => {
		if (!getDbReady())
			return res.status(503).json({ ok: false, error: "db_not_ready" });

		try {
			const row = await seasonsRepo.getActiveSeason();
			return sendPublic(res, row ?? null);
		} catch (err) {
			return res.status(500).json({ ok: false, error: err.message });
		}
	});

	// GET /content/seasons/:slug
	app.get("/content/seasons/:slug", async (req, res) => {
		if (!getDbReady())
			return res.status(503).json({ ok: false, error: "db_not_ready" });

		const slug = normalizeSlug(req.params.slug);
		if (!slug) return sendBadRequest(res, "invalid_slug");

		try {
			const row = await seasonsRepo.getSeasonBySlug(slug);
			if (!row) return sendNotFound(res, "season_not_found");
			return sendPublic(res, row);
		} catch (err) {
			return res.status(500).json({ ok: false, error: err.message });
		}
	});
}