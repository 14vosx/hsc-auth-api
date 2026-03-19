// src/db/bootstrap.js
import mysql from "mysql2/promise";

export function bootstrapDb({ dbConfig, seasonsRepo, onReady, onError }) {
  if (process.env.DB_HOST) {
    mysql
      .createConnection(dbConfig)
      .then(async (connection) => {
        try {
          await connection.execute(`SELECT 1`);
          await seasonsRepo.getActiveSeason();

          onReady();
          console.log("Database readiness check passed.");
        } finally {
          await connection.end();
        }
      })
      .catch((err) => {
        onError(err);
        console.error("Database readiness check failed:", err);
      });
  } else {
    console.warn("DB not configured. Skipping database readiness check.");
  }
}