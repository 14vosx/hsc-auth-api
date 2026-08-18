import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { validateSeasonInput } from "../../../src/services/seasons/validators.js";

const validInput = {
  slug: "season-two",
  name: "Season Two",
  start_at: "2026-08-01T12:00:00Z",
  end_at: "2026-08-01T13:00:00Z",
  cover_image_url: "https://cdn.example/season.png",
};

test("valid input returns normalized creation fields", () => {
  assert.deepEqual(
    validateSeasonInput({
      ...validInput,
      slug: "  Season TWO  ",
      name: "  Season Two  ",
      start_at: "2026-08-01T01:02:03.999Z",
      end_at: "2026-08-01T04:05:06.999Z",
      cover_image_url: "  https://cdn.example/season.png  ",
    }),
    {
      ok: true,
      slug: "season-two",
      name: "Season Two",
      startAt: "2026-08-01 01:02:03",
      endAt: "2026-08-01 04:05:06",
      coverImageUrl: "https://cdn.example/season.png",
    },
  );
});

test("unknown properties are ignored without mutating the payload", () => {
  const payload = {
    ...validInput,
    unknown: "ignored",
    nested: { untouched: true },
  };
  const snapshot = structuredClone(payload);

  const result = validateSeasonInput(payload);

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result, "unknown"), false);
  assert.equal(Object.hasOwn(result, "nested"), false);
  assert.deepEqual(payload, snapshot);
});

test("empty slug produces invalid_slug", () => {
  assert.deepEqual(validateSeasonInput({ ...validInput, slug: "   " }), {
    ok: false,
    error: "invalid_slug",
  });
});

test("normalized slug longer than 64 characters produces slug_too_long", () => {
  assert.deepEqual(validateSeasonInput({ ...validInput, slug: "a".repeat(65) }), {
    ok: false,
    error: "slug_too_long",
  });
});

test("empty name produces missing_name", () => {
  assert.deepEqual(validateSeasonInput({ ...validInput, name: "   " }), {
    ok: false,
    error: "missing_name",
  });
});

test("missing start_at produces missing_datetime with start_at field", () => {
  const { start_at, ...input } = validInput;

  assert.deepEqual(validateSeasonInput(input), {
    ok: false,
    error: "missing_datetime",
    field: "start_at",
  });
});

test("missing end_at produces missing_datetime with end_at field", () => {
  const { end_at, ...input } = validInput;

  assert.deepEqual(validateSeasonInput(input), {
    ok: false,
    error: "missing_datetime",
    field: "end_at",
  });
});

test("date without Z produces datetime_must_be_utc_z with the correct field", () => {
  assert.deepEqual(
    validateSeasonInput({ ...validInput, start_at: "2026-08-01T12:00:00" }),
    {
      ok: false,
      error: "datetime_must_be_utc_z",
      field: "start_at",
    },
  );
  assert.deepEqual(
    validateSeasonInput({ ...validInput, end_at: "2026-08-01T13:00:00" }),
    {
      ok: false,
      error: "datetime_must_be_utc_z",
      field: "end_at",
    },
  );
});

test("invalid date produces invalid_datetime with the correct field", () => {
  assert.deepEqual(validateSeasonInput({ ...validInput, start_at: "invalidZ" }), {
    ok: false,
    error: "invalid_datetime",
    field: "start_at",
  });
  assert.deepEqual(validateSeasonInput({ ...validInput, end_at: "invalidZ" }), {
    ok: false,
    error: "invalid_datetime",
    field: "end_at",
  });
});

test("normalized interval of at least one second is accepted", () => {
  const result = validateSeasonInput({
    ...validInput,
    start_at: "2026-08-01T12:00:00.999Z",
    end_at: "2026-08-01T12:00:01.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.startAt, "2026-08-01 12:00:00");
  assert.equal(result.endAt, "2026-08-01 12:00:01");
});

test("equal or inverted interval at second precision is rejected", () => {
  assert.deepEqual(
    validateSeasonInput({
      ...validInput,
      start_at: "2026-08-01T12:00:00Z",
      end_at: "2026-08-01T12:00:00Z",
    }),
    { ok: false, error: "start_must_be_before_end" },
  );
  assert.deepEqual(
    validateSeasonInput({
      ...validInput,
      start_at: "2026-08-01T12:00:01Z",
      end_at: "2026-08-01T12:00:00Z",
    }),
    { ok: false, error: "start_must_be_before_end" },
  );
});

test("millisecond-only difference that collapses to equality is rejected", () => {
  assert.deepEqual(
    validateSeasonInput({
      ...validInput,
      start_at: "2026-08-01T12:00:00.100Z",
      end_at: "2026-08-01T12:00:00.200Z",
    }),
    { ok: false, error: "start_must_be_before_end" },
  );
});
