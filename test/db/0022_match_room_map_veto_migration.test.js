import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0022_match_room_map_veto.sql",
  import.meta.url,
);

test("0022 migration defines match_room_map_vetos and match_room_map_veto_actions schema", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_room_map_vetos/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_room_map_veto_actions/i);

  assert.match(sql, /room_id\s+CHAR\(36\)\s+PRIMARY KEY/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(room_id,\s*pool_id\)/i);
  assert.match(sql, /PRIMARY KEY \(room_id,\s*action_order\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(room_id,\s*map_key\)/i);

  assert.match(sql, /REFERENCES match_rooms\(id\)/i);
  assert.match(sql, /REFERENCES match_map_pools\(id\)/i);
  assert.match(sql, /REFERENCES match_map_pool_entries\(pool_id,\s*map_key\)/i);

  assert.match(sql, /CHECK \(next_action_order IS NULL OR \(next_action_order BETWEEN 1 AND 6\)\)/i);
  assert.match(sql, /CHECK \(action_order BETWEEN 1 AND 6\)/i);
  assert.match(sql, /CHECK \(source IN \('MANUAL_BAN',\s*'TIMEOUT_AUTO_BAN'\)\)/i);
});
