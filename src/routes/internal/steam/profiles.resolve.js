import crypto from "node:crypto";

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function registerInternalSteamProfilesResolveRoute(app, {
  getDbReady,
  steamProfilesService,
  internalApiKey,
  sendBadRequest,
}) {
  app.post("/internal/steam/profiles/resolve", async (req, res) => {
    const configuredKey = String(internalApiKey ?? "").trim();
    if (!configuredKey) {
      return res
        .status(503)
        .json({ ok: false, error: "internal_api_key_not_configured" });
    }

    const requestKey = String(req.get("X-Internal-Key") ?? "").trim();
    if (!requestKey || !secureCompare(requestKey, configuredKey)) {
      return res.status(401).json({ ok: false, error: "invalid_internal_key" });
    }

    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    if (!req.body || !Array.isArray(req.body.steamids)) {
      return sendBadRequest(res, "invalid_body");
    }

    try {
      const { profiles, missing } = await steamProfilesService.resolveProfiles(
        req.body.steamids,
      );

      return res.status(200).json({
        ok: true,
        profiles,
        missing,
      });
    } catch {
      return res
        .status(500)
        .json({ ok: false, error: "steam_profiles_resolve_failed" });
    }
  });
}
