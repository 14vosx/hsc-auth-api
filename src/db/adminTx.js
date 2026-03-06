import mysql from "mysql2/promise";

export async function runInTx(dbConfig, fn) {
  const conn = await mysql.createConnection(dbConfig);

  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    await conn.end();
  }
}

export async function insertAdminAudit(conn, {
  userId = null,
  route,
  method,
  action,
  via,
  forceFail = false,
}) {
  if (forceFail) {
    await conn.execute(
      `
      INSERT INTO admin_audit_log (non_existing_column)
      VALUES (1)
      `,
    );
    return;
  }

  await conn.execute(
    `
    INSERT INTO admin_audit_log
    (user_id, route, method, action, via)
    VALUES (?, ?, ?, ?, ?)
    `,
    [userId, route, method, action, via],
  );
}
