// src/services/seasons/validators.js
import { normalizeSlug } from "../../utils/slug.js";
import { parseUtcIsoToDatetime } from "../../utils/datetime.js";

export function validateSeasonInput({ slug, name, start_at, end_at }) {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) return { ok: false, error: "invalid_slug" };
  if (cleanSlug.length > 64) return { ok: false, error: "slug_too_long" };

  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "missing_name" };

  const start = parseUtcIsoToDatetime(start_at);
  if (!start.ok) return { ok: false, error: start.error, field: "start_at" };

  const end = parseUtcIsoToDatetime(end_at);
  if (!end.ok) return { ok: false, error: end.error, field: "end_at" };

  // Compare using Date objects to avoid string compare edge cases
  const startMs = new Date(String(start_at).trim()).getTime();
  const endMs = new Date(String(end_at).trim()).getTime();
  if (!(startMs < endMs))
    return { ok: false, error: "start_must_be_before_end" };

  return {
    ok: true,
    slug: cleanSlug,
    name: cleanName,
    startAt: start.datetime,
    endAt: end.datetime,
  };
}

export function validateSeasonPatch(current, patch) {
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

  let startAt = current.start_at;
  let endAt = current.end_at;

  if (patch.start_at != null) {
    const p = parseUtcIsoToDatetime(patch.start_at);
    if (!p.ok) return { ok: false, error: p.error, field: "start_at" };
    out.startAt = p.datetime;
    startAt = p.datetime;
  }

  if (patch.end_at != null) {
    const p = parseUtcIsoToDatetime(patch.end_at);
    if (!p.ok) return { ok: false, error: p.error, field: "end_at" };
    out.endAt = p.datetime;
    endAt = p.datetime;
  }

  // If any date changed, re-check ordering using UTC timestamps
  if (patch.start_at != null || patch.end_at != null) {
    const startMs = new Date(
      (patch.start_at ?? current.start_at + "Z").replace(" ", "T"),
    ).getTime();
    const endMs = new Date(
      (patch.end_at ?? current.end_at + "Z").replace(" ", "T"),
    ).getTime();

    if (!(startMs < endMs))
      return { ok: false, error: "start_must_be_before_end" };
  }

  return { ok: true, patch: out };
}