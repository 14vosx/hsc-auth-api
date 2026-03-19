// src/db/bootstrap.js
import { ensureSchema } from "./schema.js";

export function bootstrapDb({ dbConfig, seasonsRepo, onReady, onError }) {
  if (process.env.DB_HOST) {
    ensureSchema(dbConfig)
      .then(async () => {
        // sanity check: ensure repo can query seasons
        await seasonsRepo.getActiveSeason();

        onReady();
        console.log("Database schema ensured (v7).");
      })
      .catch((err) => {
        onError(err);
        console.error("Schema bootstrap failed:", err);
      });
  } else {
    console.warn("DB not configured. Skipping schema bootstrap.");
  }
}