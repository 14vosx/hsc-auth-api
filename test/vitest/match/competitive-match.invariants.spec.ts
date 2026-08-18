import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  validateCompetitiveMatchSetupInvariants,
  validateCompetitiveMatchRuntimeSnapshot,
} from "../../../src/nest/match/competitive-match/competitive-match.invariants.js";

const PLAYERS = Array.from({ length: 10 }, (_, i) => `player-${i + 1}`);
const STEAM_IDS = Array.from({ length: 10 }, (_, i) => `7656119800000000${i}`);

const VALID_PARAMS = {
  roomStatus: "SETUP",
  draftCompleted: true,
  vetoCompleted: true,
  selectedMapKey: "de_mirage",
  mapMetadata: {
    poolId: "pool-1",
    poolKey: "mix_5v5",
    poolVersion: 1,
    mapKey: "de_mirage",
    displayName: "Mirage",
  },
  participantAccountIds: PLAYERS,
  draftAssignments: PLAYERS.map((playerAccountId, idx) => ({
    playerAccountId,
    team: idx < 5 ? "A" : "B",
  })),
  steamIdentities: PLAYERS.map((playerAccountId, idx) => ({
    playerAccountId,
    steamid64: STEAM_IDS[idx]!,
  })),
};

test("validateCompetitiveMatchSetupInvariants validates and builds snapshot for 10-player 5v5", () => {
  const result = validateCompetitiveMatchSetupInvariants(VALID_PARAMS);
  assert.equal(result.map.key, "de_mirage");
  assert.equal(result.map.displayName, "Mirage");
  assert.equal(result.map.poolVersion, 1);
  assert.equal(result.roster.length, 10);
  assert.equal(result.roster.filter((r) => r.team === "A").length, 5);
  assert.equal(result.roster.filter((r) => r.team === "B").length, 5);
  assert.equal(result.roster[0]?.steamid64, STEAM_IDS[0]);
});

test("validateCompetitiveMatchSetupInvariants throws if room is not SETUP", () => {
  assert.throws(
    () => validateCompetitiveMatchSetupInvariants({ ...VALID_PARAMS, roomStatus: "FORMING" }),
    /must be in SETUP/,
  );
});

test("validateCompetitiveMatchSetupInvariants throws if draft or veto is incomplete", () => {
  assert.throws(
    () => validateCompetitiveMatchSetupInvariants({ ...VALID_PARAMS, draftCompleted: false }),
    /Draft must be COMPLETED/,
  );
  assert.throws(
    () => validateCompetitiveMatchSetupInvariants({ ...VALID_PARAMS, vetoCompleted: false }),
    /Map veto must be COMPLETED/,
  );
});

test("validateCompetitiveMatchSetupInvariants throws if participant count is not 10", () => {
  assert.throws(
    () =>
      validateCompetitiveMatchSetupInvariants({
        ...VALID_PARAMS,
        participantAccountIds: PLAYERS.slice(0, 9),
      }),
    /Expected exactly 10 active participants/,
  );
});

test("validateCompetitiveMatchSetupInvariants throws if team balance is not 5v5", () => {
  const unbalancedAssignments = PLAYERS.map((playerAccountId, idx) => ({
    playerAccountId,
    team: idx < 6 ? "A" : "B",
  }));
  assert.throws(
    () =>
      validateCompetitiveMatchSetupInvariants({
        ...VALID_PARAMS,
        draftAssignments: unbalancedAssignments,
      }),
    /Expected 5 Team A and 5 Team B/,
  );
});

test("validateCompetitiveMatchSetupInvariants throws if steam identity is missing", () => {
  assert.throws(
    () =>
      validateCompetitiveMatchSetupInvariants({
        ...VALID_PARAMS,
        steamIdentities: VALID_PARAMS.steamIdentities.slice(0, 9),
      }),
    /does not have a linked Steam identity/,
  );
});

test("validateCompetitiveMatchRuntimeSnapshot enforces runtimeMatchId >= 1_000_000", () => {
  const mapSnapshot = {
    poolId: VALID_PARAMS.mapMetadata.poolId,
    poolKey: VALID_PARAMS.mapMetadata.poolKey,
    poolVersion: VALID_PARAMS.mapMetadata.poolVersion,
    key: VALID_PARAMS.mapMetadata.mapKey,
    displayName: VALID_PARAMS.mapMetadata.displayName,
  };
  const validSnapshot = validateCompetitiveMatchRuntimeSnapshot({
    id: "match-1",
    runtimeMatchId: 1000000,
    map: mapSnapshot,
    roster: VALID_PARAMS.draftAssignments.map((a, idx) => ({
      playerAccountId: a.playerAccountId,
      steamid64: STEAM_IDS[idx]!,
      team: a.team as "A" | "B",
    })),
  });
  assert.equal(validSnapshot.runtimeMatchId, 1000000);

  assert.throws(
    () =>
      validateCompetitiveMatchRuntimeSnapshot({
        id: "match-1",
        runtimeMatchId: 999999,
        map: mapSnapshot,
        roster: validSnapshot.roster,
      }),
    /Invalid runtimeMatchId/,
  );
});
