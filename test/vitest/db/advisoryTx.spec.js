import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from 'node:assert/strict';

import { runWithAdvisoryLockTx } from "../../../src/db/advisoryTx.js";

const DB_CONFIG = Object.freeze({ database: 'test' });
const LOCK_NAME = 'hsc:seasons:lifecycle:v1';

function createHarness({
  getLockResult = 1,
  getLockError,
  beginError,
  commitError,
  rollbackError,
  releaseResult = 1,
  releaseError,
  endError,
  createError,
} = {}) {
  const calls = [];
  const queries = [];

  const conn = {
    async execute(sql, parameters) {
      if (sql.includes('GET_LOCK')) {
        calls.push('GET_LOCK');
        queries.push({ stage: 'GET_LOCK', sql, parameters });
        if (getLockError) throw getLockError;
        return [[{ acquired: getLockResult }]];
      }

      if (sql.includes('RELEASE_LOCK')) {
        calls.push('RELEASE_LOCK');
        queries.push({ stage: 'RELEASE_LOCK', sql, parameters });
        if (releaseError) throw releaseError;
        return [[{ released: releaseResult }]];
      }

      throw new Error('unexpected query');
    },

    async beginTransaction() {
      calls.push('beginTransaction');
      if (beginError) throw beginError;
    },

    async commit() {
      calls.push('commit');
      if (commitError) throw commitError;
    },

    async rollback() {
      calls.push('rollback');
      if (rollbackError) throw rollbackError;
    },

    async end() {
      calls.push('end');
      if (endError) throw endError;
    },
  };

  async function createConnection(receivedDbConfig) {
    calls.push('createConnection');
    assert.equal(receivedDbConfig, DB_CONFIG);
    if (createError) throw createError;
    return conn;
  }

  function createWork({ value = 'work-result', error } = {}) {
    return async function work(receivedConn) {
      calls.push('work');
      assert.equal(receivedConn, conn);
      if (error) throw error;
      return value;
    };
  }

  return {
    calls,
    conn,
    createConnection,
    createWork,
    queries,
  };
}

function run(harness, {
  timeoutSeconds = 5,
  work = harness.createWork(),
} = {}) {
  return runWithAdvisoryLockTx({
    dbConfig: DB_CONFIG,
    lockName: LOCK_NAME,
    timeoutSeconds,
    work,
    createConnection: harness.createConnection,
  });
}

function stages(harness) {
  return harness.calls;
}

test('GET_LOCK is parameterized with lock name and timeout', async () => {
  const harness = createHarness();

  await run(harness);

  const query = harness.queries.find(({ stage }) => stage === 'GET_LOCK');
  assert.equal(query.sql, 'SELECT GET_LOCK(?, ?) AS acquired');
  assert.deepEqual(query.parameters, [LOCK_NAME, 5]);
  assert.doesNotMatch(query.sql, /hsc:seasons/);
});

test('work receives the same connection that acquired the lock', async () => {
  const harness = createHarness();
  let receivedConnection;

  await run(harness, {
    work: async (conn) => {
      harness.calls.push('work');
      receivedConnection = conn;
    },
  });

  assert.equal(receivedConnection, harness.conn);
});

test('successful work commits, cleans up, and preserves value', async () => {
  const harness = createHarness();

  const result = await run(harness, {
    work: harness.createWork({ value: { updated: 1 } }),
  });

  assert.deepEqual(result, {
    acquired: true,
    value: { updated: 1 },
    cleanupWarnings: [],
  });
  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'work',
    'commit',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('undefined work result is preserved', async () => {
  const harness = createHarness();

  const result = await run(harness, {
    work: async (conn) => {
      harness.calls.push('work');
      assert.equal(conn, harness.conn);
      return undefined;
    },
  });

  assert.equal(result.acquired, true);
  assert.equal(result.value, undefined);
  assert.deepEqual(result.cleanupWarnings, []);
});

test('timeout returns a discriminated result without transaction or release', async () => {
  const harness = createHarness({ getLockResult: 0 });

  const result = await run(harness);

  assert.deepEqual(result, {
    acquired: false,
    reason: 'timeout',
    cleanupWarnings: [],
  });
  assert.deepEqual(stages(harness), ['createConnection', 'GET_LOCK', 'end']);
});

test('timeout preserves result and reports end failure', async () => {
  const harness = createHarness({
    getLockResult: 0,
    endError: new Error('end failed'),
  });

  const result = await run(harness);

  assert.deepEqual(result, {
    acquired: false,
    reason: 'timeout',
    cleanupWarnings: [
      { stage: 'connection_end', code: 'connection_end_failed' },
    ],
  });
});

test('GET_LOCK null throws acquire failure and ends connection', async () => {
  const harness = createHarness({ getLockResult: null });

  await assert.rejects(run(harness), (error) => {
    assert.equal(error.code, 'advisory_lock_acquire_failed');
    return true;
  });
  assert.deepEqual(stages(harness), ['createConnection', 'GET_LOCK', 'end']);
});

test('unexpected GET_LOCK result throws a stable error', async () => {
  const harness = createHarness({ getLockResult: 2 });

  await assert.rejects(run(harness), (error) => {
    assert.equal(error.code, 'advisory_lock_unexpected_result');
    return true;
  });
  assert.deepEqual(stages(harness), ['createConnection', 'GET_LOCK', 'end']);
});

test('GET_LOCK exception is propagated unchanged and connection ends', async () => {
  const getLockError = new Error('get lock failed');
  const harness = createHarness({ getLockError });

  await assert.rejects(run(harness), (error) => error === getLockError);
  assert.deepEqual(stages(harness), ['createConnection', 'GET_LOCK', 'end']);
});

test('begin failure is preserved without rollback', async () => {
  const beginError = new Error('begin failed');
  const harness = createHarness({ beginError });

  await assert.rejects(run(harness), (error) => error === beginError);
  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('work failure is preserved and triggers rollback and cleanup', async () => {
  const workError = new Error('work failed');
  const harness = createHarness();

  await assert.rejects(
    run(harness, { work: harness.createWork({ error: workError }) }),
    (error) => error === workError,
  );
  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'work',
    'rollback',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('rollback failure warns without replacing work error', async () => {
  const workError = new Error('work failed');
  const harness = createHarness({ rollbackError: new Error('rollback failed') });

  await assert.rejects(
    run(harness, { work: harness.createWork({ error: workError }) }),
    (error) => {
      assert.equal(error, workError);
      assert.deepEqual(error.cleanupWarnings, [
        { stage: 'rollback', code: 'transaction_rollback_failed' },
      ]);
      return true;
    },
  );
});

test('release failure warns without replacing work error', async () => {
  const workError = new Error('work failed');
  const harness = createHarness({ releaseError: new Error('release failed') });

  await assert.rejects(
    run(harness, { work: harness.createWork({ error: workError }) }),
    (error) => {
      assert.equal(error, workError);
      assert.deepEqual(error.cleanupWarnings, [
        { stage: 'release_lock', code: 'advisory_lock_release_failed' },
      ]);
      return true;
    },
  );
});

test('end failure warns without replacing work error', async () => {
  const workError = new Error('work failed');
  const harness = createHarness({ endError: new Error('end failed') });

  await assert.rejects(
    run(harness, { work: harness.createWork({ error: workError }) }),
    (error) => {
      assert.equal(error, workError);
      assert.deepEqual(error.cleanupWarnings, [
        { stage: 'connection_end', code: 'connection_end_failed' },
      ]);
      return true;
    },
  );
});

test('commit failure remains primary and triggers rollback and cleanup', async () => {
  const commitError = new Error('commit failed');
  const harness = createHarness({ commitError });

  await assert.rejects(run(harness), (error) => error === commitError);
  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'work',
    'commit',
    'rollback',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('release result zero after commit becomes a warning', async () => {
  const harness = createHarness({ releaseResult: 0 });

  const result = await run(harness);

  assert.equal(result.acquired, true);
  assert.equal(result.value, 'work-result');
  assert.deepEqual(result.cleanupWarnings, [
    { stage: 'release_lock', code: 'advisory_lock_release_failed' },
  ]);
});

test('release result null after commit becomes a warning', async () => {
  const harness = createHarness({ releaseResult: null });

  const result = await run(harness);

  assert.equal(result.acquired, true);
  assert.equal(result.value, 'work-result');
  assert.deepEqual(result.cleanupWarnings, [
    { stage: 'release_lock', code: 'advisory_lock_release_failed' },
  ]);
});

test('release exception after commit becomes a warning', async () => {
  const harness = createHarness({ releaseError: new Error('release failed') });

  const result = await run(harness);

  assert.equal(result.acquired, true);
  assert.equal(result.value, 'work-result');
  assert.deepEqual(result.cleanupWarnings, [
    { stage: 'release_lock', code: 'advisory_lock_release_failed' },
  ]);
});

test('end exception after commit becomes a warning', async () => {
  const harness = createHarness({ endError: new Error('end failed') });

  const result = await run(harness);

  assert.equal(result.acquired, true);
  assert.equal(result.value, 'work-result');
  assert.deepEqual(result.cleanupWarnings, [
    { stage: 'connection_end', code: 'connection_end_failed' },
  ]);
});

test('release and end warnings after commit preserve their order', async () => {
  const harness = createHarness({
    releaseError: new Error('release failed'),
    endError: new Error('end failed'),
  });

  const result = await run(harness);

  assert.deepEqual(result.cleanupWarnings, [
    { stage: 'release_lock', code: 'advisory_lock_release_failed' },
    { stage: 'connection_end', code: 'connection_end_failed' },
  ]);
});

test('HTTP timeout value 5 reaches GET_LOCK', async () => {
  const harness = createHarness({ getLockResult: 0 });

  await run(harness, { timeoutSeconds: 5 });

  assert.deepEqual(harness.queries[0].parameters, [LOCK_NAME, 5]);
});

test('reconciler timeout value 0 reaches GET_LOCK', async () => {
  const harness = createHarness({ getLockResult: 0 });

  await run(harness, { timeoutSeconds: 0 });

  assert.deepEqual(harness.queries[0].parameters, [LOCK_NAME, 0]);
});

test('success call order is exact', async () => {
  const harness = createHarness();

  await run(harness);

  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'work',
    'commit',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('work error call order is exact', async () => {
  const harness = createHarness();
  const workError = new Error('work failed');

  await assert.rejects(
    run(harness, { work: harness.createWork({ error: workError }) }),
    (error) => error === workError,
  );
  assert.deepEqual(stages(harness), [
    'createConnection',
    'GET_LOCK',
    'beginTransaction',
    'work',
    'rollback',
    'RELEASE_LOCK',
    'end',
  ]);
});

test('createConnection failure is propagated without end attempt', async () => {
  const createError = new Error('create failed');
  const harness = createHarness({ createError });

  await assert.rejects(run(harness), (error) => error === createError);
  assert.deepEqual(stages(harness), ['createConnection']);
});
