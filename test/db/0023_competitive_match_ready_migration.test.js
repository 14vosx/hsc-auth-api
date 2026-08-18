import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0023_competitive_match_ready.sql",
  import.meta.url,
);

test("0023 migration defines ready_at, competitive_matches and competitive_match_roster schema", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  // match_rooms ready_at and index
  assert.match(sql, /COLUMN_NAME = 'ready_at'/i);
  assert.match(sql, /ready_at DATETIME\(6\) NULL/i);
  assert.match(sql, /idx_match_rooms_status_ready_id/i);

  // competitive_matches
  assert.match(sql, /CREATE TABLE IF NOT EXISTS competitive_matches/i);
  assert.match(sql, /id CHAR\(36\) PRIMARY KEY/i);
  assert.match(sql, /runtime_match_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/i);
  assert.match(sql, /AUTO_INCREMENT=1000000/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(room_id\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(runtime_match_id\)/i);
  assert.match(sql, /REFERENCES match_rooms\(id\)/i);
  assert.match(sql, /REFERENCES match_map_pool_entries\(pool_id,\s*map_key\)/i);
  assert.match(sql, /CHECK \(map_pool_version >= 1\)/i);

  // competitive_match_roster
  assert.match(sql, /CREATE TABLE IF NOT EXISTS competitive_match_roster/i);
  assert.match(sql, /PRIMARY KEY \(competitive_match_id,\s*player_account_id\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(competitive_match_id,\s*steamid64\)/i);
  assert.match(sql, /REFERENCES competitive_matches\(id\)/i);
  assert.match(sql, /REFERENCES player_accounts\(id\)/i);
  assert.match(sql, /CHECK \(team IN \('A',\s*'B'\)\)/i);
});
