import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../db/migrations/0015_player_profiles.sql",
    import.meta.url,
  ),
  "utf8",
);

test("player_profiles mantém relação 0..1 com player_accounts", () => {
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS player_profiles/,
  );

  assert.match(
    sql,
    /player_account_id CHAR\(36\) NOT NULL/,
  );

  assert.match(
    sql,
    /UNIQUE KEY uniq_player_profiles_player_account_id \(player_account_id\)/,
  );

  assert.match(
    sql,
    /FOREIGN KEY \(player_account_id\)[\s\S]*REFERENCES player_accounts\(id\)[\s\S]*ON DELETE CASCADE/,
  );
});

test("player_profiles nasce privado e possui identidade pública própria", () => {
  assert.match(
    sql,
    /display_name VARCHAR\(255\) NOT NULL/,
  );

  assert.match(
    sql,
    /slug VARCHAR\(64\) NOT NULL/,
  );

  assert.match(
    sql,
    /UNIQUE KEY uniq_player_profiles_slug \(slug\)/,
  );

  assert.match(
    sql,
    /visibility ENUM\('private', 'public'\) NOT NULL DEFAULT 'private'/,
  );
});

test("player_profiles suporta personalização CS2 sem ENUM rígido", () => {
  assert.match(
    sql,
    /preferred_role VARCHAR\(32\) NULL/,
  );

  assert.match(
    sql,
    /preferred_map VARCHAR\(64\) NULL/,
  );

  assert.doesNotMatch(
    sql,
    /preferred_role ENUM/i,
  );

  assert.doesNotMatch(
    sql,
    /preferred_map ENUM/i,
  );
});

test("player_profiles não duplica credenciais ou identidades de autenticação", () => {
  assert.doesNotMatch(
    sql,
    /\bpassword_hash\b/i,
  );

  assert.doesNotMatch(
    sql,
    /\bsteamid64\b/i,
  );

  assert.doesNotMatch(
    sql,
    /\bemail\b/i,
  );

  assert.doesNotMatch(
    sql,
    /\bsession\b/i,
  );
});
