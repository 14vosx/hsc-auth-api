import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from 'node:assert/strict';

import {
  SEASON_LIFECYCLE_ERROR_CODES,
  SEASON_STATUSES,
  SeasonLifecycleError,
  assertSeasonCanActivate,
  assertSeasonCanClose,
  shouldAutoCloseSeason,
} from "../../../src/services/seasons/lifecycle.js";

const START_AT = new Date('2026-08-01T12:00:00.000Z');
const END_AT = new Date('2026-08-01T13:00:00.000Z');

function activationInput(overrides = {}) {
  return {
    status: SEASON_STATUSES.DRAFT,
    startAt: START_AT,
    endAt: END_AT,
    now: START_AT,
    hasOtherActiveSeason: false,
    ...overrides,
  };
}

function assertLifecycleCode(operation, expectedCode) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof SeasonLifecycleError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test('activation permits draft exactly at startAt', () => {
  assert.equal(assertSeasonCanActivate(activationInput()), true);
});

test('activation rejects draft one millisecond before startAt', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      now: new Date(START_AT.getTime() - 1),
    })),
    SEASON_LIFECYCLE_ERROR_CODES.NOT_STARTED,
  );
});

test('activation permits draft one millisecond before endAt', () => {
  assert.equal(
    assertSeasonCanActivate(activationInput({
      now: new Date(END_AT.getTime() - 1),
    })),
    true,
  );
});

test('activation rejects draft exactly at endAt', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({ now: END_AT })),
    SEASON_LIFECYCLE_ERROR_CODES.EXPIRED,
  );
});

test('activation rejects draft after endAt', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      now: new Date(END_AT.getTime() + 1),
    })),
    SEASON_LIFECYCLE_ERROR_CODES.EXPIRED,
  );
});

test('activation rejects an active Season', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      status: SEASON_STATUSES.ACTIVE,
    })),
    SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
  );
});

test('activation rejects a closed Season', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      status: SEASON_STATUSES.CLOSED,
    })),
    SEASON_LIFECYCLE_ERROR_CODES.CLOSED,
  );
});

test('activation rejects when another Season is active', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      hasOtherActiveSeason: true,
    })),
    SEASON_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT,
  );
});

test('activation rejects startAt as an ISO string with Z', () => {
  assert.throws(
    () => assertSeasonCanActivate(activationInput({
      startAt: '2026-08-01T12:00:00.000Z',
    })),
    {
      name: 'TypeError',
      message: 'Season lifecycle requires valid instants.',
    },
  );
});

test('activation rejects startAt as a string without timezone', () => {
  assert.throws(
    () => assertSeasonCanActivate(activationInput({
      startAt: '2026-08-01T12:00:00.000',
    })),
    {
      name: 'TypeError',
      message: 'Season lifecycle requires valid instants.',
    },
  );
});

test('activation rejects an invalid Date', () => {
  assert.throws(
    () => assertSeasonCanActivate(activationInput({
      startAt: new Date(Number.NaN),
    })),
    {
      name: 'TypeError',
      message: 'Season lifecycle requires valid instants.',
    },
  );
});

test('activation precedence favors already active over other failures', () => {
  assertLifecycleCode(
    () => assertSeasonCanActivate(activationInput({
      status: SEASON_STATUSES.ACTIVE,
      hasOtherActiveSeason: true,
      now: new Date(END_AT.getTime() + 1),
    })),
    SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
  );
});

test('activation does not modify its input', () => {
  const input = activationInput();
  const original = {
    ...input,
    startAt: new Date(input.startAt.getTime()),
    endAt: new Date(input.endAt.getTime()),
    now: new Date(input.now.getTime()),
  };

  assertSeasonCanActivate(input);

  assert.deepEqual(input, original);
});

test('closing permits an active Season', () => {
  assert.equal(
    assertSeasonCanClose({ status: SEASON_STATUSES.ACTIVE }),
    true,
  );
});

test('closing rejects a draft Season', () => {
  assertLifecycleCode(
    () => assertSeasonCanClose({ status: SEASON_STATUSES.DRAFT }),
    SEASON_LIFECYCLE_ERROR_CODES.NOT_ACTIVE,
  );
});

test('closing rejects an already closed Season', () => {
  assertLifecycleCode(
    () => assertSeasonCanClose({ status: SEASON_STATUSES.CLOSED }),
    SEASON_LIFECYCLE_ERROR_CODES.ALREADY_CLOSED,
  );
});

test('auto-close returns false for active before endAt', () => {
  assert.equal(shouldAutoCloseSeason({
    status: SEASON_STATUSES.ACTIVE,
    endAt: END_AT,
    now: new Date(END_AT.getTime() - 1),
  }), false);
});

test('auto-close returns true for active exactly at endAt', () => {
  assert.equal(shouldAutoCloseSeason({
    status: SEASON_STATUSES.ACTIVE,
    endAt: END_AT,
    now: END_AT,
  }), true);
});

test('auto-close returns true for active after endAt', () => {
  assert.equal(shouldAutoCloseSeason({
    status: SEASON_STATUSES.ACTIVE,
    endAt: END_AT,
    now: new Date(END_AT.getTime() + 1),
  }), true);
});

test('auto-close returns false for expired draft', () => {
  assert.equal(shouldAutoCloseSeason({
    status: SEASON_STATUSES.DRAFT,
    endAt: END_AT,
    now: new Date(END_AT.getTime() + 1),
  }), false);
});

test('auto-close returns false for expired closed', () => {
  assert.equal(shouldAutoCloseSeason({
    status: SEASON_STATUSES.CLOSED,
    endAt: END_AT,
    now: new Date(END_AT.getTime() + 1),
  }), false);
});

test('auto-close rejects endAt as a number', () => {
  assert.throws(
    () => shouldAutoCloseSeason({
      status: SEASON_STATUSES.ACTIVE,
      endAt: END_AT.getTime(),
      now: END_AT,
    }),
    {
      name: 'TypeError',
      message: 'Season lifecycle requires valid instants.',
    },
  );
});
