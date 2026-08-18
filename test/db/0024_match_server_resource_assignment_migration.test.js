import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0024_match_server_resource_assignment.sql",
  import.meta.url,
);

test("0024 migration defines match_server_resources, match_server_assignments and match_server_commands schema without seed", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  // match_server_resources
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_server_resources/i);
  assert.match(sql, /server_key VARCHAR\(64\) PRIMARY KEY/i);
  assert.match(sql, /enabled TINYINT\(1\) NOT NULL DEFAULT 1/i);
  assert.match(sql, /bridge_node_key VARCHAR\(64\) NOT NULL/i);
  assert.match(sql, /match_edge_source_key VARCHAR\(64\) NOT NULL/i);
  assert.match(sql, /join_reference VARCHAR\(255\) NOT NULL/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(match_edge_source_key\)/i);
  assert.match(sql, /KEY [^\n]*\(bridge_node_key,\s*enabled,\s*server_key\)/i);
  assert.match(sql, /CHECK \(enabled IN \(0,\s*1\)\)/i);
  assert.match(sql, /CHECK \(server_key <> match_edge_source_key\)/i);

  // match_server_assignments
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_server_assignments/i);
  assert.match(sql, /id CHAR\(36\) PRIMARY KEY/i);
  assert.match(sql, /competitive_match_id CHAR\(36\) NOT NULL/i);
  assert.match(sql, /server_key VARCHAR\(64\) NOT NULL/i);
  assert.match(sql, /assigned_at DATETIME\(6\) NOT NULL/i);
  assert.match(sql, /released_at DATETIME\(6\) NULL/i);
  assert.match(sql, /release_reason VARCHAR\(32\) NULL/i);
  assert.match(sql, /active_server_key VARCHAR\(64\)/i);
  assert.match(sql, /active_competitive_match_id CHAR\(36\)/i);
  assert.match(sql, /RTRIM\(competitive_match_id\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(active_server_key\)/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(active_competitive_match_id\)/i);
  assert.match(sql, /REFERENCES competitive_matches\(id\)/i);
  assert.match(sql, /REFERENCES match_server_resources\(server_key\)/i);

  // match_server_commands
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_server_commands/i);
  assert.match(sql, /id CHAR\(36\) PRIMARY KEY/i);
  assert.match(sql, /assignment_id CHAR\(36\) NOT NULL/i);
  assert.match(sql, /bridge_node_key VARCHAR\(64\) NOT NULL/i);
  assert.match(sql, /command_type VARCHAR\(32\) NOT NULL/i);
  assert.match(sql, /runtime_match_id BIGINT UNSIGNED NOT NULL/i);
  assert.match(sql, /UNIQUE KEY [^\n]*\(assignment_id,\s*command_type\)/i);
  assert.match(sql, /KEY [^\n]*\(bridge_node_key,\s*created_at,\s*id\)/i);
  assert.match(sql, /REFERENCES match_server_assignments\(id\)/i);
  assert.match(sql, /CHECK \(command_type = 'PREPARE_MATCH'\)/i);
  assert.match(sql, /CHECK \(runtime_match_id >= 1000000\)/i);

  // No seed INSERT statements
  assert.doesNotMatch(sql, /INSERT INTO/i);
});
