import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from 'node:assert/strict';

import { insertAdminAudit } from "../../../src/db/adminTx.js";

function createFakeConnection({ result, error } = {}) {
  const calls = [];

  return {
    calls,
    async execute(sql, parameters) {
      calls.push({ sql, parameters });

      if (error) {
        throw error;
      }

      return result;
    },
  };
}

const LEGACY_PAYLOAD = Object.freeze({
  userId: null,
  route: '/admin/seasons/:slug/activate',
  method: 'POST',
  action: 'season.activate',
  via: 'session',
});

test('legacy call persists null entity metadata and preserves existing values', async () => {
  const conn = createFakeConnection();

  await insertAdminAudit(conn, LEGACY_PAYLOAD);

  assert.equal(conn.calls.length, 1);
  assert.match(
    conn.calls[0].sql,
    /\(user_id, route, method, action, via, entity_type, entity_key\)/,
  );
  assert.deepEqual(conn.calls[0].parameters, [
    null,
    '/admin/seasons/:slug/activate',
    'POST',
    'season.activate',
    'session',
    null,
    null,
  ]);
});

test('entity metadata is sent only through SQL parameters', async () => {
  const conn = createFakeConnection();

  await insertAdminAudit(conn, {
    ...LEGACY_PAYLOAD,
    entityType: 'season',
    entityKey: 's2-2026',
  });

  const [{ sql, parameters }] = conn.calls;
  assert.deepEqual(parameters.slice(-2), ['season', 's2-2026']);
  assert.doesNotMatch(sql, /season/);
  assert.doesNotMatch(sql, /s2-2026/);
});

test('explicit null entity metadata remains null', async () => {
  const conn = createFakeConnection();

  await insertAdminAudit(conn, {
    ...LEGACY_PAYLOAD,
    entityType: null,
    entityKey: null,
  });

  assert.deepEqual(conn.calls[0].parameters.slice(-2), [null, null]);
});

test('dangerous entity key is not interpolated into SQL', async () => {
  const dangerousEntityKey = "s2-2026'); DROP TABLE seasons; --";
  const conn = createFakeConnection();

  await insertAdminAudit(conn, {
    ...LEGACY_PAYLOAD,
    entityType: 'season',
    entityKey: dangerousEntityKey,
  });

  const [{ sql, parameters }] = conn.calls;
  assert.equal(parameters.at(-1), dangerousEntityKey);
  assert.doesNotMatch(sql, /DROP TABLE seasons/);
  assert.doesNotMatch(sql, /s2-2026/);
});

test('connection errors are propagated unchanged', async () => {
  const connectionError = new Error('connection failed');
  const conn = createFakeConnection({ error: connectionError });

  await assert.rejects(
    insertAdminAudit(conn, LEGACY_PAYLOAD),
    (error) => error === connectionError,
  );
});

test('successful audit insert preserves the undefined return contract', async () => {
  const conn = createFakeConnection({
    result: [{ insertId: 42, affectedRows: 1 }],
  });

  const result = await insertAdminAudit(conn, LEGACY_PAYLOAD);

  assert.equal(result, undefined);
});
