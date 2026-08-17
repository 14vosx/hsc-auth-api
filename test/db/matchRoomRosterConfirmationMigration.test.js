import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0019_match_room_roster_confirmation.sql",
  import.meta.url,
);

test("0019 independently and idempotently adds roster confirmation state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS match_rooms/i);
  assert.match(sql, /information_schema\.COLUMNS/g);
  assert.match(sql, /confirmation_round BIGINT UNSIGNED NOT NULL DEFAULT 0/i);
  assert.match(sql, /confirmation_started_at DATETIME\(6\) NULL/i);
  assert.match(sql, /confirmation_deadline_at DATETIME\(6\) NULL/i);
  assert.match(sql, /roster_locked_at DATETIME\(6\) NULL/i);
  assert.match(sql, /confirmed_round BIGINT UNSIGNED NULL/i);
  assert.match(sql, /confirmed_at DATETIME\(6\) NULL/i);
  assert.match(sql, /idx_match_rooms_status_confirmation_deadline/i);
  assert.doesNotMatch(sql, /\bcapacity\b\s+(?:INT|BIGINT|SMALLINT|TINYINT)/i);
});
