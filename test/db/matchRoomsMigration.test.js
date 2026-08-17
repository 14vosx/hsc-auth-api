import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../db/migrations/0018_match_rooms.sql", import.meta.url);

test("match room migration encodes capacity-independent rooms and global active-player uniqueness", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_rooms/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_room_participants/);
  assert.doesNotMatch(sql, /\bcapacity\b\s+(?:INT|BIGINT|SMALLINT|TINYINT)/i);
  assert.match(sql, /WHEN released_at IS NULL THEN RTRIM\(player_account_id\)/);
  assert.match(sql, /UNIQUE KEY uniq_match_room_active_player \(active_player_account_id\)/);
  assert.match(sql, /KEY idx_match_rooms_status_created \(status, created_at\)/);
  assert.match(sql, /FOREIGN KEY \(room_id\)/);
  assert.match(sql, /FOREIGN KEY \(player_account_id\)/);
});
