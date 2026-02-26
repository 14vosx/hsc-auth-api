import crypto from "crypto";
import mysql from "mysql2/promise";

export function getCookieConfig() {
  const name = (process.env.COOKIE_NAME || "hsc_sid").trim();
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const secure = String(process.env.COOKIE_SECURE || "true").toLowerCase() === "true";
  const ttlMinutes = Number(process.env.SESSION_TTL_MINUTES || 60 * 24 * 7); // 7d default
  return { name, sameSite, secure, ttlMinutes };
}

function nowPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function setSessionCookie(res, sid) {
  const { name, sameSite, secure, ttlMinutes } = getCookieConfig();
  res.cookie(name, sid, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: ttlMinutes * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  const { name, sameSite, secure } = getCookieConfig();
  // precisa repetir path e, idealmente, secure/samesite pra limpar de forma consistente
  res.cookie(name, "", {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 0,
  });
}

export function readSessionId(req) {
  const { name } = getCookieConfig();
  return req.cookies?.[name] || null;
}

export async function createSession(dbConfig, userId) {
  const sid = crypto.randomBytes(32).toString("hex");
  const { ttlMinutes } = getCookieConfig();
  const expiresAt = nowPlusMinutes(ttlMinutes);

  const connection = await mysql.createConnection(dbConfig);
  await connection.execute(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sid, Number(userId), expiresAt],
  );
  await connection.end();

  return sid;
}

export async function getSession(dbConfig, sid) {
  if (!sid) return null;

  const connection = await mysql.createConnection(dbConfig);
  const [rows] = await connection.execute(
    `
    SELECT user_id
    FROM sessions
    WHERE id = ?
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
    `,
    [sid],
  );
  await connection.end();

  return rows[0]?.user_id ?? null;
}

export async function revokeSession(dbConfig, sid) {
  if (!sid) return;

  const connection = await mysql.createConnection(dbConfig);
  await connection.execute(
    `UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [sid],
  );
  await connection.end();
}
