import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../db/migrations/0020_match_room_captains_draft.sql",
  import.meta.url,
);

test("0020 independently and idempotently defines match room draft schema", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_room_drafts/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS match_room_draft_assignments/i);
  assert.match(sql, /PRIMARY KEY \(room_id, player_account_id\)/i);
  assert.doesNotMatch(sql, /match_room_draft_assignments[\s\S]*?\bid\b\s+CHAR\(36\)\s+PRIMARY KEY/i);
  assert.match(sql, /REFERENCES match_room_drafts\(room_id\)/i);
  assert.match(sql, /REFERENCES match_rooms\(id\)/i);
});
