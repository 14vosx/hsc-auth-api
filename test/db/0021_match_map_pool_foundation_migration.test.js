import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0021_match_map_pool_foundation.sql",
  import.meta.url,
);

test("0021 migration structural invariants and mix_5v5 v1 seed", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_map_pools/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_map_pool_entries/i);

  assert.match(sql, /UNIQUE KEY [^\n]*\(pool_key,\s*version\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(active_pool_key\)/i);

  assert.match(sql, /PRIMARY KEY \(pool_id,\s*map_key\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(pool_id,\s*position\)/i);

  assert.match(sql, /mix_5v5/i);
  assert.match(sql, /de_ancient/i);
  assert.match(sql, /de_anubis/i);
  assert.match(sql, /de_cache/i);
  assert.match(sql, /de_dust2/i);
  assert.match(sql, /de_inferno/i);
  assert.match(sql, /de_mirage/i);
  assert.match(sql, /de_nuke/i);
});
