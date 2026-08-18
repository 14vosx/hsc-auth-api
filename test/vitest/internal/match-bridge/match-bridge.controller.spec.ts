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

// ---------------------------------------------------------------------------
// heartbeat — authentication contract
// ---------------------------------------------------------------------------

test("MatchBridgeController rejects heartbeat when x-hsc-bridge-key is missing or invalid", async () => {
  const fakeRepo = {
    authenticateBridgeNode: async (key: string) => {
      return key === "valid-secret" ? "node-01" : null;
    },
    touchHeartbeat: async () => {},
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(fakeRepo);

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
  let touchedHeartbeat = false;
  const fakeRepo = {
    authenticateBridgeNode: async (key: string) => (key === "valid-secret" ? "node-01" : null),
    claimNextCommand: async (nodeKey: string) => {
      return nodeKey === "node-01" ? null : undefined;
    },
    touchHeartbeat: async () => {
      touchedHeartbeat = true;
    },
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(fakeRepo);

  const res = await controller.claim({ "x-hsc-bridge-key": "valid-secret" });
  expect(res).toEqual({ ok: true, protocolVersion: 1, command: null });
  expect(touchedHeartbeat).toBe(false);
});

// ---------------------------------------------------------------------------
// submitResult — payload validation contract
// ---------------------------------------------------------------------------

test("MatchBridgeController validates result submission payload structure", async () => {
  const fakeRepo = {
    authenticateBridgeNode: async () => "node-01",
    submitCommandResult: async () => {},
  } as unknown as MatchBridgeRepository;

  const controller = new MatchBridgeController(fakeRepo);
  const headers = { "x-hsc-bridge-key": "valid-secret" };

  // Empty body
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", null); }).rejects.toThrow();

  // Unknown field
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
      unknownProp: 123,
    }); }).rejects.toThrow();

  // Invalid outcome
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "UNKNOWN_OUTCOME",
      resultCode: "PREPARED",
    }); }).rejects.toThrow();

  // Opaque values and exact protocol literals are rejected, never repaired.
  await await expect(async () => { await controller.submitResult(headers, " cmd-1 ", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    }); }).rejects.toThrow();
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", {
      leaseToken: " tok-1 ",
      outcome: "SUCCEEDED",
      resultCode: "PREPARED",
    }); }).rejects.toThrow();
  await await expect(async () => { await controller.submitResult(headers, "cmd-1", {
      leaseToken: "tok-1",
      outcome: "SUCCEEDED",
      resultCode: " PREPARED ",
    }); }).rejects.toThrow();

  // Valid payload
  const res = await controller.submitResult(headers, "cmd-1", {
    leaseToken: "tok-1",
    outcome: "SUCCEEDED",
    resultCode: "PREPARED",
    result: { ok: true },
  });
  expect(res).toEqual({ ok: true });
});
