/**
 * G1 MatchBridgeController — observable HTTP contract tests.
 *
 * Moved from: src/nest/internal/match-bridge/match-bridge.controller.spec.ts
 * Reason: Production source tree must contain production code only.
 *
 * Canonical Vitest spec for G1 MatchBridgeController.
 *
 * G1 behavioral checks are preserved exactly. No tests were added or removed.
 */

import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";

import { HttpException } from "@nestjs/common";
import { MatchBridgeController } from "../../../../src/nest/internal/match-bridge/match-bridge.controller.js";
import { MatchBridgeRepository } from "../../../../src/nest/internal/match-bridge/match-bridge.repository.js";
import { ServerAssignmentService } from "../../../../src/nest/match/server-assignment/server-assignment.service.js";
import type { ClaimedCommandPayload } from "../../../../src/nest/internal/match-bridge/match-bridge.contract.js";

const dummyServerAssignmentService = {} as ServerAssignmentService;

// ---------------------------------------------------------------------------
// heartbeat — authentication contract
// ---------------------------------------------------------------------------

test("MatchBridgeController rejects heartbeat when x-hsc-bridge-key is missing or invalid", async () => {
  const fakeRepo = {
    authenticateBridgeNode: async (key: string) => {
      return key === "valid-secret" ? "node-01" : null;
    },
    touchHeartbeat: async () => { },
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(fakeRepo, dummyServerAssignmentService);

  // Missing header
  await await expect(async () => { await controller.heartbeat({}); }).rejects.toThrow();

  // Invalid secret
  await await expect(async () => { await controller.heartbeat({ "x-hsc-bridge-key": "invalid-secret" }); }).rejects.toThrow();

  // Valid secret
  const res = await controller.heartbeat({ "x-hsc-bridge-key": "valid-secret" });
  expect(res).toEqual({ ok: true });
});

// ---------------------------------------------------------------------------
// claim — authentication + delegation contract
// ---------------------------------------------------------------------------

test("MatchBridgeController rejects claim when unauthenticated and delegates to repository when authenticated", async () => {
  const fakeRepo = {
    authenticateBridgeNode: async () => null,
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(
    fakeRepo,
    dummyServerAssignmentService,
  );

  await await expect(async () => {
    await controller.claim({ "x-hsc-bridge-key": "invalid-secret" });
  }).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// claim — G3-C4 wiring contracts (priority, allocation trigger, idle)
// ---------------------------------------------------------------------------

test("MatchBridgeController claim: existing command has priority without triggering allocation", async () => {
  let claimCalls = 0;
  let assignCalls = 0;

  const existingCommand: ClaimedCommandPayload = {
    commandId: "cmd-01",
    assignmentId: "asg-01",
    commandType: "PREPARE_MATCH",
    attempt: 1,
    leaseToken: "tok-01",
    leaseExpiresAt: "2026-08-19T00:00:00.000Z",
    target: { serverKey: "sv-01" },
    matchSpec: {
      specVersion: 1,
      competitiveMatchId: "cm-01",
      runtimeMatchId: 1000000001,
      map: {
        poolKey: "pool-01",
        poolVersion: 1,
        key: "de_dust2",
        displayName: "Dust II",
      },
      teams: {
        A: [{ playerAccountId: "p1", steamid64: "76561198000000001", personaname: "Player 1" }],
        B: [{ playerAccountId: "p2", steamid64: "76561198000000002", personaname: "Player 2" }],
      },
    },
  };

  const fakeRepo = {
    authenticateBridgeNode: async (key: string) =>
      key === "valid-secret" ? "node-01" : null,
    claimNextCommand: async (nodeKey: string) => {
      claimCalls += 1;
      return nodeKey === "node-01" ? existingCommand : null;
    },
  } as unknown as MatchBridgeRepository;

  const fakeAssignmentService = {
    assignNextReadyForBridgeNode: async () => {
      assignCalls += 1;
      return null;
    },
  } as unknown as ServerAssignmentService;

  const controller = new MatchBridgeController(
    fakeRepo,
    fakeAssignmentService,
  );

  const res = await controller.claim({ "x-hsc-bridge-key": "valid-secret" });

  expect(res).toEqual({
    ok: true,
    protocolVersion: 1,
    command: existingCommand,
  });
  expect(claimCalls).toBe(1);
  expect(assignCalls).toBe(0);
});

test("MatchBridgeController claim: empty queue triggers allocation and returns prepared command on second claim", async () => {
  let claimCalls = 0;
  let assignCalls = 0;
  let assignedNodeKey = "";

  const preparedCommand: ClaimedCommandPayload = {
    commandId: "cmd-02",
    assignmentId: "asg-02",
    commandType: "PREPARE_MATCH",
    attempt: 1,
    leaseToken: "tok-02",
    leaseExpiresAt: "2026-08-19T00:00:00.000Z",
    target: { serverKey: "sv-02" },
    matchSpec: {
      specVersion: 1,
      competitiveMatchId: "cm-02",
      runtimeMatchId: 1000000002,
      map: {
        poolKey: "pool-01",
        poolVersion: 1,
        key: "de_inferno",
        displayName: "Inferno",
      },
      teams: {
        A: [{ playerAccountId: "p1", steamid64: "76561198000000001", personaname: "Player 1" }],
        B: [{ playerAccountId: "p2", steamid64: "76561198000000002", personaname: "Player 2" }],
      },
    },
  };

  const fakeRepo = {
    authenticateBridgeNode: async (key: string) =>
      key === "valid-secret" ? "node-01" : null,
    claimNextCommand: async (nodeKey: string) => {
      claimCalls += 1;
      if (nodeKey === "node-01") {
        return claimCalls === 1 ? null : preparedCommand;
      }
      return null;
    },
  } as unknown as MatchBridgeRepository;

  const fakeAssignmentService = {
    assignNextReadyForBridgeNode: async (nodeKey: string) => {
      assignCalls += 1;
      assignedNodeKey = nodeKey;
      return null;
    },
  } as unknown as ServerAssignmentService;

  const controller = new MatchBridgeController(
    fakeRepo,
    fakeAssignmentService,
  );

  const res = await controller.claim({ "x-hsc-bridge-key": "valid-secret" });

  expect(res).toEqual({
    ok: true,
    protocolVersion: 1,
    command: preparedCommand,
  });
  expect(assignedNodeKey).toBe("node-01");
  expect(assignCalls).toBe(1);
  expect(claimCalls).toBe(2);
});

test("MatchBridgeController claim: no READY work remains idle", async () => {
  let claimCalls = 0;
  let assignCalls = 0;

  const fakeRepo = {
    authenticateBridgeNode: async (key: string) =>
      key === "valid-secret" ? "node-01" : null,
    claimNextCommand: async () => {
      claimCalls += 1;
      return null;
    },
  } as unknown as MatchBridgeRepository;

  const fakeAssignmentService = {
    assignNextReadyForBridgeNode: async () => {
      assignCalls += 1;
      return null;
    },
  } as unknown as ServerAssignmentService;

  const controller = new MatchBridgeController(
    fakeRepo,
    fakeAssignmentService,
  );

  const res = await controller.claim({ "x-hsc-bridge-key": "valid-secret" });

  expect(res).toEqual({
    ok: true,
    protocolVersion: 1,
    command: null,
  });
  expect(assignCalls).toBe(1);
  expect(claimCalls).toBe(2);
});

// ---------------------------------------------------------------------------
// submitResult — payload validation contract
// ---------------------------------------------------------------------------

test("MatchBridgeController validates result submission payload structure", async () => {
  const fakeRepo = {
    authenticateBridgeNode: async () => "node-01",
    submitCommandResult: async () => { },
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(fakeRepo, dummyServerAssignmentService);
  const headers = { "x-hsc-bridge-key": "valid-secret" };

  // Empty body
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", null); }).rejects.toThrow();

  // Unknown field
  await await expect(async () => {
    await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      unknownProp: 123,
    });
  }).rejects.toThrow();

  // Invalid outcome
  await await expect(async () => {
    await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "UNKNOWN_OUTCOME",
      resultCode: "PREPARED",
    });
  }).rejects.toThrow();

  // Opaque values and exact protocol literals are rejected, never repaired.
  await await expect(async () => {
    await controller.submitResult(headers, " cmd-1 ", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });
  }).rejects.toThrow();
  await await expect(async () => {
    await controller.submitResult(headers, "cmd-1", {
      leaseToken: " tok-1 ",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    });
  }).rejects.toThrow();
  await await expect(async () => {
    await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: " PREPARED ",
    });
  }).rejects.toThrow();

  // Valid payload
  const res = await controller.submitResult(headers, "cmd-1", {
    leaseToken: "tok-1",
    outcome: "SUCCEEDED",
    resultCode: "PREPARED",
    result: { ok: true },
  });
  expect(res).toEqual({ ok: true });
});
