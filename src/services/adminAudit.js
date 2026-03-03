// src/services/adminAudit.js
import mysql from "mysql2/promise";

export async function auditAdminAction({ dbConfig, req, action }) {
  const via = req?.auth?.via || "session";
  const userId = req?.auth?.userId ?? null;
  const route = String(req?.originalUrl || req?.url || "").split("?")[0];
  const method = String(req?.method || "GET").toUpperCase();

  const connection = await mysql.createConnection(dbConfig);
  await connection.execute(
    `
    INSERT INTO admin_audit_log (user_id, route, method, action, via)
    VALUES (?, ?, ?, ?, ?)
    `,
    [userId, route, method, String(action), via],
  );
  await connection.end();
}
