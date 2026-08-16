import test from "node:test";
import assert from "node:assert/strict";
import { MatchIngressError } from "../../../../src/nest/internal/match/match-ingress-error.js";
import {
  MatchIngressRepository,
  type MatchIngressRecord,
  type MatchIngressRow,
} from "../../../../src/nest/internal/match/match-ingress.repository.js";

const VALID_RECORD: MatchIngressRecord = {
  sourceKey: "server01.sa-east-1",
  edgeEventId: "0123456789abcdef0123456789abcdef",
  edgeSequence: 100n,
  eventName: "map_start",
  localMatchId: 42n,
  edgeReceivedAt: "2026-08-16T14:00:00Z",
  payloadJsonText: '{"event":"map_start","map":"de_dust2"}',
  payloadSha256: "a".repeat(64),
};

function createSampleRow(overrides: Record<string, any> = {}): MatchIngressRow {
  return {
    id: 1,
    source_key: VALID_RECORD.sourceKey,
    edge_event_id: VALID_RECORD.edgeEventId,
    edge_sequence: 100,
    event_name: VALID_RECORD.eventName,
    local_matchid: 42,
    edge_received_at: "2026-08-16T14:00:00.000Z",
    payload_json: VALID_RECORD.payloadJsonText,
    payload_sha256: VALID_RECORD.payloadSha256,
    ingested_at: "2026-08-16T14:00:01.000Z",
    ...overrides,
  } as MatchIngressRow;
}

function createMockDatabaseService(
  executeHandler: (query: string, params: unknown[]) => Promise<any>,
) {
  return {
    getPool() {
      return {
        execute: executeHandler,
      };
    },
  } as any;
}

test("MatchIngressRepository Suite", async (t) => {
  await t.test("1. insert normal: SELECT inicial vazio -> INSERT sucesso -> duplicate=false", async () => {
    let selectCalled = false;
    let insertCalled = false;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        selectCalled = true;
        return [[]];
      }
      if (query.trim().startsWith("INSERT")) {
        insertCalled = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_RECORD);

    assert.equal(selectCalled, true);
    assert.equal(insertCalled, true);
    assert.deepEqual(result, { duplicate: false });
  });

  await t.test("2. registro já existente idêntico: SELECT inicial encontra linha -> não tenta INSERT -> duplicate=true", async () => {
    let insertCalled = false;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        return [[createSampleRow()]];
      }
      if (query.trim().startsWith("INSERT")) {
        insertCalled = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_RECORD);

    assert.equal(insertCalled, false);
    assert.deepEqual(result, { duplicate: true });
  });

  await t.test("3. registro já existente divergente: SELECT inicial encontra linha com immutable fields diferentes -> lança idempotency_conflict", async () => {
    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        return [[createSampleRow({ payload_sha256: "b".repeat(64) })]];
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "idempotency_conflict",
    );
  });

  await t.test("4. race ER_DUP_ENTRY por code: SELECT vazio -> INSERT lança code=ER_DUP_ENTRY -> refetch idêntico -> duplicate=true", async () => {
    let selectCount = 0;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        selectCount++;
        if (selectCount === 1) {
          return [[]];
        }
        return [[createSampleRow()]];
      }
      if (query.trim().startsWith("INSERT")) {
        const err: any = new Error("Duplicate entry");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_RECORD);

    assert.equal(selectCount, 2);
    assert.deepEqual(result, { duplicate: true });
  });

  await t.test("5. race errno 1062: SELECT vazio -> INSERT lança errno=1062 -> refetch idêntico -> duplicate=true", async () => {
    let selectCount = 0;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        selectCount++;
        if (selectCount === 1) {
          return [[]];
        }
        return [[createSampleRow()]];
      }
      if (query.trim().startsWith("INSERT")) {
        const err: any = new Error("Duplicate entry");
        err.errno = 1062;
        throw err;
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_RECORD);

    assert.equal(selectCount, 2);
    assert.deepEqual(result, { duplicate: true });
  });

  await t.test("6. race concorrente com conteúdo divergente: INSERT lança duplicate key -> refetch encontra registro divergente -> lança idempotency_conflict", async () => {
    let selectCount = 0;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        selectCount++;
        if (selectCount === 1) {
          return [[]];
        }
        return [[createSampleRow({ edge_sequence: 999 })]];
      }
      if (query.trim().startsWith("INSERT")) {
        const err: any = new Error("Duplicate entry");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "idempotency_conflict",
    );

    assert.equal(selectCount, 2);
  });

  await t.test("7. duplicate-key seguido de refetch sem registro: lança idempotency_conflict", async () => {
    let selectCount = 0;

    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        selectCount++;
        return [[]];
      }
      if (query.trim().startsWith("INSERT")) {
        const err: any = new Error("Duplicate entry");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "idempotency_conflict",
    );

    assert.equal(selectCount, 2);
  });

  await t.test("8. erro SQL comum no INSERT: lança erro genérico (NÃO trata como duplicate race)", async () => {
    const db = createMockDatabaseService(async (query: string) => {
      if (query.trim().startsWith("SELECT")) {
        return [[]];
      }
      if (query.trim().startsWith("INSERT")) {
        const err: any = new Error("Deadlock found when trying to get lock");
        err.code = "ER_LOCK_DEADLOCK";
        throw err;
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_RECORD),
      (err: any) => err.code === "ER_LOCK_DEADLOCK",
    );
  });
});
