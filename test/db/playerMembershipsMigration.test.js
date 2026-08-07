import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../db/migrations/0016_player_memberships.sql",
    import.meta.url,
  ),
  "utf8",
);

test("player_memberships mantém relação 0..1 com player_accounts", () => {
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS player_memberships/,
  );

  assert.match(
    sql,
    /player_account_id CHAR\(36\) NOT NULL/,
  );

  assert.match(
    sql,
    /UNIQUE KEY uniq_player_memberships_player_account_id \(player_account_id\)/,
  );

  assert.match(
    sql,
    /FOREIGN KEY \(player_account_id\)[\s\S]*REFERENCES player_accounts\(id\)[\s\S]*ON DELETE CASCADE/,
  );
});

test("player_memberships mantém membership separada da conta", () => {
  assert.match(
    sql,
    /id CHAR\(36\) PRIMARY KEY/,
  );

  assert.doesNotMatch(sql, /\bemail\b/i);
  assert.doesNotMatch(sql, /\bpassword_hash\b/i);
  assert.doesNotMatch(sql, /\bsteamid64\b/i);
  assert.doesNotMatch(sql, /\bsession_token\b/i);
});

test("player_memberships define os estados mínimos aprovados", () => {
  assert.match(
    sql,
    /status ENUM\([\s\S]*'inactive'[\s\S]*'active'[\s\S]*'suspended'[\s\S]*'expired'[\s\S]*'cancelled'[\s\S]*\) NOT NULL DEFAULT 'inactive'/,
  );

  assert.match(sql, /started_at DATETIME NULL/);
  assert.match(sql, /expires_at DATETIME NULL/);
  assert.match(sql, /suspended_at DATETIME NULL/);
  assert.match(sql, /cancelled_at DATETIME NULL/);
});

test("player_memberships registra plano e origem sem dados financeiros", () => {
  assert.match(
    sql,
    /plan_code VARCHAR\(64\) NOT NULL/,
  );

  assert.match(
    sql,
    /source ENUM\([\s\S]*'manual'[\s\S]*'staff'[\s\S]*'promotion'[\s\S]*'subscription'[\s\S]*\) NOT NULL/,
  );

  assert.doesNotMatch(sql, /\bcard\b/i);
  assert.doesNotMatch(sql, /\bpayment_method\b/i);
  assert.doesNotMatch(sql, /\bcustomer_secret\b/i);
});

test("player_memberships possui índices operacionais mínimos", () => {
  assert.match(
    sql,
    /KEY idx_player_memberships_status \(status\)/,
  );

  assert.match(
    sql,
    /KEY idx_player_memberships_plan_code \(plan_code\)/,
  );

  assert.match(
    sql,
    /KEY idx_player_memberships_expires_at \(expires_at\)/,
  );
});
