// src/utils/datetime.js

export function formatUtcDatetime(date) {
  // Returns "YYYY-MM-DD HH:MM:SS" in UTC
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

export function parseUtcIsoToDatetime(value) {
  // Strict: must be ISO-like and must include trailing 'Z' (UTC)
  const s = String(value || "").trim();
  if (!s) return { ok: false, error: "missing_datetime" };
  if (!s.endsWith("Z")) return { ok: false, error: "datetime_must_be_utc_z" };

  const d = new Date(s);
  if (Number.isNaN(d.getTime()))
    return { ok: false, error: "invalid_datetime" };

  return { ok: true, datetime: formatUtcDatetime(d) };
}