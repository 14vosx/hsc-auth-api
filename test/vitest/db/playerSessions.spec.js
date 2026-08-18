import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

test("findActivePlayerSessionByToken: persona Steam prevalece sobre display_name da conta", async () => {
  const fakeRow = {
    session_id: "sess_1",
    player_account_id: "acc_1",
    expires_at: new Date("2026-12-31"),
    display_name: "Account Name",
    steamid64: "76561198000000000",
    personaname: "Canonical Steam Persona",
    avatar_medium_url: "https://example.com/avatar.jpg",
    profile_url: "https://steamcommunity.com/profiles/76561198000000000",
  };

  const session = {
    sessionId: fakeRow.session_id,
    playerAccountId: fakeRow.player_account_id,
    steamid64: fakeRow.steamid64 ?? null,
    displayName: fakeRow.personaname ?? fakeRow.display_name ?? null,
    avatarMedium: fakeRow.avatar_medium_url ?? null,
    steamProfileUrl: fakeRow.profile_url ?? null,
    expiresAt: fakeRow.expires_at,
  };

  assert.equal(session.displayName, "Canonical Steam Persona");
  assert.equal(session.avatarMedium, "https://example.com/avatar.jpg");
  assert.equal(session.steamProfileUrl, "https://steamcommunity.com/profiles/76561198000000000");
});

test("findActivePlayerSessionByToken: fallback para display_name da conta quando persona não existe", async () => {
  const fakeRow = {
    session_id: "sess_1",
    player_account_id: "acc_1",
    expires_at: new Date("2026-12-31"),
    display_name: "Account Fallback Name",
    steamid64: "76561198000000000",
    personaname: null,
    avatar_medium_url: null,
    profile_url: null,
  };

  const session = {
    sessionId: fakeRow.session_id,
    playerAccountId: fakeRow.player_account_id,
    steamid64: fakeRow.steamid64 ?? null,
    displayName: fakeRow.personaname ?? fakeRow.display_name ?? null,
    avatarMedium: fakeRow.avatar_medium_url ?? null,
    steamProfileUrl: fakeRow.profile_url ?? null,
    expiresAt: fakeRow.expires_at,
  };

  assert.equal(session.displayName, "Account Fallback Name");
  assert.equal(session.avatarMedium, null);
  assert.equal(session.steamProfileUrl, null);
});

test("findActivePlayerSessionByToken: nulls permanecem seguros quando campos estão ausentes", async () => {
  const fakeRow = {
    session_id: "sess_1",
    player_account_id: "acc_1",
    expires_at: new Date("2026-12-31"),
    display_name: null,
    steamid64: null,
    personaname: null,
    avatar_medium_url: null,
    profile_url: null,
  };

  const session = {
    sessionId: fakeRow.session_id,
    playerAccountId: fakeRow.player_account_id,
    steamid64: fakeRow.steamid64 ?? null,
    displayName: fakeRow.personaname ?? fakeRow.display_name ?? null,
    avatarMedium: fakeRow.avatar_medium_url ?? null,
    steamProfileUrl: fakeRow.profile_url ?? null,
    expiresAt: fakeRow.expires_at,
  };

  assert.equal(session.displayName, null);
  assert.equal(session.avatarMedium, null);
  assert.equal(session.steamProfileUrl, null);
});
