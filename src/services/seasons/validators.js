// src/services/seasons/validators.js
import { normalizeSlug } from "../../utils/slug.js";
import { parseUtcIsoToDatetime } from "../../utils/datetime.js";

function normalizeCoverImageUrl(value) {
  if (value == null) return null;

  const clean = String(value).trim();
  return clean ? clean : null;
}

export function validateSeasonInput({ slug, name, start_at, end_at, cover_image_url }) {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) return { ok: false, error: "invalid_slug" };
  if (cleanSlug.length > 64) return { ok: false, error: "slug_too_long" };

  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "missing_name" };

  const start = parseUtcIsoToDatetime(start_at);
  if (!start.ok) return { ok: false, error: start.error, field: "start_at" };

  const end = parseUtcIsoToDatetime(end_at);
  if (!end.ok) return { ok: false, error: end.error, field: "end_at" };

  const range = validateSeasonDateRange({
    startAt: start.datetime,
    endAt: end.datetime,
  });
  if (!range.ok)
    return { ok: false, error: "start_must_be_before_end" };

  return {
    ok: true,
    slug: cleanSlug,
    name: cleanName,
    startAt: start.datetime,
    endAt: end.datetime,
    coverImageUrl: normalizeCoverImageUrl(cover_image_url),
  };
}

export function normalizeSeasonPatch(patch) {
  const out = {};

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) return { ok: false, error: "missing_name" };
    out.name = name;
  }

  if (patch.description !== undefined) {
    out.description =
      patch.description == null ? null : String(patch.description).trim();
  }

  if (Object.hasOwn(patch, "cover_image_url")) {
    out.coverImageUrl = normalizeCoverImageUrl(patch.cover_image_url);
  }

  if (patch.start_at != null) {
    const p = parseUtcIsoToDatetime(patch.start_at);
    if (!p.ok) return { ok: false, error: p.error, field: "start_at" };
    out.startAt = p.datetime;
  }

  if (patch.end_at != null) {
    const p = parseUtcIsoToDatetime(patch.end_at);
    if (!p.ok) return { ok: false, error: p.error, field: "end_at" };
    out.endAt = p.datetime;
  }

  return { ok: true, patch: out };
}

function toUtcEpochMilliseconds(value) {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value !== "string") return null;

  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return date.getTime();
}

export function validateSeasonDateRange({ startAt, endAt }) {
  const startMs = toUtcEpochMilliseconds(startAt);
  const endMs = toUtcEpochMilliseconds(endAt);

  if (startMs == null || endMs == null) {
    return { ok: false, error: "invalid_datetime" };
  }

  if (!(startMs < endMs)) {
    return { ok: false, error: "start_must_be_before_end" };
  }

  return { ok: true };
}

export function validateSeasonPatch(current, patch) {
  const normalized = normalizeSeasonPatch(patch);
  if (!normalized.ok) return normalized;

  const finalStartAt = Object.hasOwn(normalized.patch, "startAt")
    ? normalized.patch.startAt
    : current.start_at;
  const finalEndAt = Object.hasOwn(normalized.patch, "endAt")
    ? normalized.patch.endAt
    : current.end_at;

  const range = validateSeasonDateRange({
    startAt: finalStartAt,
    endAt: finalEndAt,
  });
  if (!range.ok) return range;

  return normalized;
}
