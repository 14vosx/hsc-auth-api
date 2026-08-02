import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSeasonPatch,
  validateSeasonDateRange,
  validateSeasonPatch,
} from "../../src/services/seasons/validators.js";

const currentStrings = {
  start_at: "2026-08-01 12:00:00",
  end_at: "2026-08-01 13:00:00",
};

test("empty patch normalizes to an empty object", () => {
  assert.deepEqual(normalizeSeasonPatch({}), { ok: true, patch: {} });
});

test("unknown properties are ignored", () => {
  const payload = { unknown: "value", nested: { retained: false } };
  const snapshot = structuredClone(payload);

  assert.deepEqual(normalizeSeasonPatch(payload), { ok: true, patch: {} });
  assert.deepEqual(payload, snapshot);
});

test("slug in the body is ignored", () => {
  assert.deepEqual(normalizeSeasonPatch({ slug: "changed-slug" }), {
    ok: true,
    patch: {},
  });
});

test("valid name is normalized with the current behavior", () => {
  assert.deepEqual(normalizeSeasonPatch({ name: "  Season Two  " }), {
    ok: true,
    patch: { name: "Season Two" },
  });
});

test("empty name produces missing_name", () => {
  assert.deepEqual(normalizeSeasonPatch({ name: "   " }), {
    ok: false,
    error: "missing_name",
  });
});

test("null name is treated as absent", () => {
  assert.deepEqual(normalizeSeasonPatch({ name: null }), {
    ok: true,
    patch: {},
  });
});

test("null description is preserved", () => {
  assert.deepEqual(normalizeSeasonPatch({ description: null }), {
    ok: true,
    patch: { description: null },
  });
});

test("empty description preserves the current semantics", () => {
  assert.deepEqual(normalizeSeasonPatch({ description: "   " }), {
    ok: true,
    patch: { description: "" },
  });
});

test("empty cover_image_url normalizes to null", () => {
  assert.deepEqual(normalizeSeasonPatch({ cover_image_url: "   " }), {
    ok: true,
    patch: { coverImageUrl: null },
  });
});

test("null cover_image_url remains null", () => {
  assert.deepEqual(normalizeSeasonPatch({ cover_image_url: null }), {
    ok: true,
    patch: { coverImageUrl: null },
  });
});

test("null start_at and end_at are treated as absent", () => {
  assert.deepEqual(normalizeSeasonPatch({ start_at: null, end_at: null }), {
    ok: true,
    patch: {},
  });
});

test("empty date produces missing_datetime with the correct field", () => {
  assert.deepEqual(normalizeSeasonPatch({ start_at: "" }), {
    ok: false,
    error: "missing_datetime",
    field: "start_at",
  });
  assert.deepEqual(normalizeSeasonPatch({ end_at: "   " }), {
    ok: false,
    error: "missing_datetime",
    field: "end_at",
  });
});

test("date without Z produces datetime_must_be_utc_z with the correct field", () => {
  assert.deepEqual(normalizeSeasonPatch({ start_at: "2026-08-01T12:00:00" }), {
    ok: false,
    error: "datetime_must_be_utc_z",
    field: "start_at",
  });
  assert.deepEqual(normalizeSeasonPatch({ end_at: "2026-08-01T13:00:00" }), {
    ok: false,
    error: "datetime_must_be_utc_z",
    field: "end_at",
  });
});

test("invalid date produces invalid_datetime with the correct field", () => {
  assert.deepEqual(normalizeSeasonPatch({ start_at: "not-a-dateZ" }), {
    ok: false,
    error: "invalid_datetime",
    field: "start_at",
  });
  assert.deepEqual(normalizeSeasonPatch({ end_at: "not-a-dateZ" }), {
    ok: false,
    error: "invalid_datetime",
    field: "end_at",
  });
});

test("valid dates normalize to MariaDB UTC strings", () => {
  const payload = {
    start_at: "2026-08-01T12:34:56.789Z",
    end_at: "2026-08-01T13:45:01.999Z",
  };
  const snapshot = structuredClone(payload);

  assert.deepEqual(normalizeSeasonPatch(payload), {
    ok: true,
    patch: {
      startAt: "2026-08-01 12:34:56",
      endAt: "2026-08-01 13:45:01",
    },
  });
  assert.deepEqual(payload, snapshot);
});

test("validateSeasonPatch combines one new date with the other current Date", () => {
  const current = {
    start_at: new Date("2026-08-01T12:00:00.000Z"),
    end_at: new Date("2026-08-01T13:00:00.000Z"),
  };
  const startTime = current.start_at.getTime();
  const endTime = current.end_at.getTime();

  assert.deepEqual(
    validateSeasonPatch(current, { start_at: "2026-08-01T12:30:00Z" }),
    {
      ok: true,
      patch: { startAt: "2026-08-01 12:30:00" },
    },
  );
  assert.deepEqual(
    validateSeasonPatch(current, { end_at: "2026-08-01T12:45:00Z" }),
    {
      ok: true,
      patch: { endAt: "2026-08-01 12:45:00" },
    },
  );
  assert.equal(current.start_at.getTime(), startTime);
  assert.equal(current.end_at.getTime(), endTime);
});

test("validateSeasonPatch accepts current MariaDB UTC strings", () => {
  assert.deepEqual(validateSeasonPatch(currentStrings, {}), {
    ok: true,
    patch: {},
  });
  assert.deepEqual(
    validateSeasonDateRange({
      startAt: "2026-08-01 12:00:00",
      endAt: new Date("2026-08-01T12:00:00.001Z"),
    }),
    { ok: true },
  );
});

test("equal or inverted final interval produces start_must_be_before_end", () => {
  assert.deepEqual(
    validateSeasonPatch(currentStrings, { end_at: "2026-08-01T12:00:00Z" }),
    { ok: false, error: "start_must_be_before_end" },
  );
  assert.deepEqual(
    validateSeasonPatch(currentStrings, { start_at: "2026-08-01T13:00:01Z" }),
    { ok: false, error: "start_must_be_before_end" },
  );
});
