export function normalizeSeasonSlug(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatUtcDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

export type ParseUtcResult =
  | { ok: true; datetime: string }
  | { ok: false; error: string };

export function parseUtcIsoToDatetime(value: unknown): ParseUtcResult {
  const s = String(value || "").trim();
  if (!s) return { ok: false, error: "missing_datetime" };
  if (!s.endsWith("Z")) return { ok: false, error: "datetime_must_be_utc_z" };

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "invalid_datetime" };
  }

  return { ok: true, datetime: formatUtcDatetime(d) };
}

function toUtcEpochMilliseconds(value: unknown): number | null {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
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

export type DateRangeResult =
  | { ok: true }
  | { ok: false; error: "invalid_datetime" | "start_must_be_before_end" };

export function validateSeasonDateRange(input: {
  startAt: unknown;
  endAt: unknown;
}): DateRangeResult {
  const startMs = toUtcEpochMilliseconds(input.startAt);
  const endMs = toUtcEpochMilliseconds(input.endAt);

  if (startMs == null || endMs == null) {
    return { ok: false, error: "invalid_datetime" };
  }

  if (!(startMs < endMs)) {
    return { ok: false, error: "start_must_be_before_end" };
  }

  return { ok: true };
}

export function normalizeCoverImageUrl(value: unknown): string | null {
  if (value == null) return null;

  const clean = String(value).trim();
  return clean ? clean : null;
}

export type ValidateSeasonInputResult =
  | {
      ok: true;
      slug: string;
      name: string;
      startAt: string;
      endAt: string;
      coverImageUrl: string | null;
    }
  | {
      ok: false;
      error: string;
      field?: string;
    };

export function validateSeasonInput(
  body: Record<string, unknown>,
): ValidateSeasonInputResult {
  const cleanSlug = normalizeSeasonSlug(body.slug);
  if (!cleanSlug) return { ok: false, error: "invalid_slug" };
  if (cleanSlug.length > 64) return { ok: false, error: "slug_too_long" };

  const cleanName = String(body.name || "").trim();
  if (!cleanName) return { ok: false, error: "missing_name" };

  const start = parseUtcIsoToDatetime(body.start_at);
  if (!start.ok) return { ok: false, error: start.error, field: "start_at" };

  const end = parseUtcIsoToDatetime(body.end_at);
  if (!end.ok) return { ok: false, error: end.error, field: "end_at" };

  const range = validateSeasonDateRange({
    startAt: start.datetime,
    endAt: end.datetime,
  });
  if (!range.ok) {
    return { ok: false, error: "start_must_be_before_end" };
  }

  return {
    ok: true,
    slug: cleanSlug,
    name: cleanName,
    startAt: start.datetime,
    endAt: end.datetime,
    coverImageUrl: normalizeCoverImageUrl(body.cover_image_url),
  };
}

export interface SeasonPatchObject {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  startAt?: string;
  endAt?: string;
}

export type NormalizeSeasonPatchResult =
  | {
      ok: true;
      patch: SeasonPatchObject;
    }
  | {
      ok: false;
      error: string;
      field?: string;
    };

export function normalizeSeasonPatch(
  patch: Record<string, unknown>,
): NormalizeSeasonPatchResult {
  const out: SeasonPatchObject = {};

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) return { ok: false, error: "missing_name" };
    out.name = name;
  }

  if (patch.description !== undefined) {
    out.description =
      patch.description == null ? null : String(patch.description).trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, "cover_image_url")) {
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
