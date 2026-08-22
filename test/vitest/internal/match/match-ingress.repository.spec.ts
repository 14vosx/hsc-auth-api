import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { MatchIngressError } from "../../../../src/nest/internal/match/match-ingress-error.js";
import {
  MatchIngressRepository,
  type MatchIngressRecord,
  type MatchIngressRow,
  type SeriesEndMatchContextRow,
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
  connectionOverrides: Record<string, any> = {},
) {
  const connection = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(() => {}),
    execute: executeHandler,
    ...connectionOverrides,
  };

  return {
    connection,
    getPool() {
      return {
        execute: executeHandler,
        getConnection: async () => connection,
      };
    },
  } as any;
}

describe("MatchIngressRepository Suite", () => {
  test("1. insert normal: SELECT inicial vazio -> INSERT sucesso -> duplicate=false", async () => {
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

  test("2. registro já existente idêntico: SELECT inicial encontra linha -> não tenta INSERT -> duplicate=true", async () => {
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

  test("3. registro já existente divergente: SELECT inicial encontra linha com immutable fields diferentes -> lança idempotency_conflict", async () => {
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

  test("4. race ER_DUP_ENTRY por code: SELECT vazio -> INSERT lança code=ER_DUP_ENTRY -> refetch idêntico -> duplicate=true", async () => {
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

  test("5. race errno 1062: SELECT vazio -> INSERT lança errno=1062 -> refetch idêntico -> duplicate=true", async () => {
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

  test("6. race concorrente com conteúdo divergente: INSERT lança duplicate key -> refetch encontra registro divergente -> lança idempotency_conflict", async () => {
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

  test("7. duplicate-key seguido de refetch sem registro: lança idempotency_conflict", async () => {
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

  test("8. erro SQL comum no INSERT: lança erro genérico (NÃO trata como duplicate race)", async () => {
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

describe("Authoritative series_end events & domain projection", () => {
  const VALID_SERIES_END_RECORD: MatchIngressRecord = {
    sourceKey: "server01.sa-east-1",
    edgeEventId: "fedcba9876543210fedcba9876543210",
    edgeSequence: 200n,
    eventName: "series_end",
    localMatchId: 1000001n,
    edgeReceivedAt: "2026-08-16T15:00:00Z",
    payloadJsonText: '{"event":"series_end","matchid":1000001}',
    payloadSha256: "b".repeat(64),
  };

  function normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }

  function createSampleSeriesEndRow(overrides: Record<string, any> = {}): MatchIngressRow {
    return {
      id: 2,
      source_key: VALID_SERIES_END_RECORD.sourceKey,
      edge_event_id: VALID_SERIES_END_RECORD.edgeEventId,
      edge_sequence: 200,
      event_name: VALID_SERIES_END_RECORD.eventName,
      local_matchid: 1000001,
      edge_received_at: "2026-08-16T15:00:00.000Z",
      payload_json: VALID_SERIES_END_RECORD.payloadJsonText,
      payload_sha256: VALID_SERIES_END_RECORD.payloadSha256,
      ingested_at: "2026-08-16T15:00:01.000Z",
      ...overrides,
    } as MatchIngressRow;
  }

  function createSampleMatchContext(overrides: Record<string, any> = {}): SeriesEndMatchContextRow {
    return {
      competitive_match_id: "match-uuid-123",
      runtime_match_id: 1000001,
      room_id: "room-uuid-456",
      room_status: "JOINABLE",
      room_version: 3,
      room_completed_at: null,
      assignment_id: "assignment-uuid-789",
      assignment_server_key: "srv-01",
      assignment_released_at: null,
      assignment_release_reason: null,
      resource_server_key: "srv-01",
      match_edge_source_key: "server01.sa-east-1",
      ...overrides,
    } as SeriesEndMatchContextRow;
  }

  test("9. series_end válido em sala JOINABLE: persiste ingress, transiciona JOINABLE -> COMPLETED, libera participantes e server assignment por id na mesma transação", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ room_status: "JOINABLE" })]];
      }
      if (norm.includes("UPDATE match_rooms")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("UPDATE match_room_participants")) {
        return [{ affectedRows: 10 }];
      }
      if (norm.includes("UPDATE match_server_assignments")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_SERIES_END_RECORD);

    assert.deepEqual(result, { duplicate: false });
    assert.equal(db.connection.beginTransaction.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 1);
    assert.equal(db.connection.rollback.mock.calls.length, 0);

    const roomUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_rooms"));
    assert.ok(roomUpdate);
    assert.ok(normalizeSql(roomUpdate.sql).includes("status = 'COMPLETED'"));
    assert.ok(normalizeSql(roomUpdate.sql).includes("completed_at = UTC_TIMESTAMP(6)"));
    assert.ok(normalizeSql(roomUpdate.sql).includes("version = version + 1"));
    assert.ok(normalizeSql(roomUpdate.sql).includes("WHERE id = ? AND status = 'JOINABLE'"));

    const participantUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_room_participants"));
    assert.ok(participantUpdate);
    assert.ok(normalizeSql(participantUpdate.sql).includes("release_reason = 'MATCH_COMPLETED'"));
    assert.ok(normalizeSql(participantUpdate.sql).includes("WHERE room_id = ? AND released_at IS NULL"));

    const assignmentUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_server_assignments"));
    assert.ok(assignmentUpdate);
    assert.ok(normalizeSql(assignmentUpdate.sql).includes("release_reason = 'MATCH_COMPLETED'"));
    assert.ok(normalizeSql(assignmentUpdate.sql).includes("WHERE id = ? AND competitive_match_id = ? AND released_at IS NULL"));
    assert.deepEqual(assignmentUpdate.params, ["assignment-uuid-789", "match-uuid-123"]);
  });

  test("10. series_end com falha no release do assignment (affectedRows=0): lança 409 failed_to_release_assignment e faz rollback total", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ room_status: "JOINABLE" })]];
      }
      if (norm.includes("UPDATE match_rooms")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("UPDATE match_room_participants")) {
        return [{ affectedRows: 10 }];
      }
      if (norm.includes("UPDATE match_server_assignments")) {
        return [{ affectedRows: 0 }]; // Falha de release concorrente / affectedRows !== 1
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_SERIES_END_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "failed_to_release_assignment",
    );

    assert.equal(db.connection.rollback.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 0);
  });

  test("11. series_end race concorrente no INSERT transacional: re-fetch usa locking read (FOR UPDATE) para furar snapshot REPEATABLE READ", async () => {
    let selectCount = 0;
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        selectCount++;
        if (selectCount === 1) {
          return [[]];
        }
        return [[createSampleSeriesEndRow()]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        const err: any = new Error("Duplicate entry");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ room_status: "COMPLETED", assignment_released_at: new Date() })]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_SERIES_END_RECORD);

    assert.deepEqual(result, { duplicate: true });
    assert.equal(selectCount, 2);

    const refetchQuery = executedQueries.filter((q) => normalizeSql(q.sql).includes("FROM match_ingress_events"))[1];
    assert.ok(refetchQuery);
    assert.ok(normalizeSql(refetchQuery.sql).includes("FOR UPDATE"), "O re-fetch transacional deve usar FOR UPDATE para current read");
  });

  test("12. series_end com sourceKey incorreto: lança 403 source_key_mismatch, faz rollback e NÃO muta domínio", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ match_edge_source_key: "server99.sa-east-1" })]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_SERIES_END_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 403 &&
        err.code === "source_key_mismatch",
    );

    assert.equal(db.connection.rollback.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 0);

    const hasDomainMutation = executedQueries.some(
      (q) =>
        normalizeSql(q.sql).includes("UPDATE match_rooms") ||
        normalizeSql(q.sql).includes("UPDATE match_room_participants") ||
        normalizeSql(q.sql).includes("UPDATE match_server_assignments"),
    );
    assert.equal(hasDomainMutation, false);
  });

  test("13. series_end com runtime_match_id inexistente: lança 404 runtime_match_not_found, faz rollback e NÃO muta domínio", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_SERIES_END_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 404 &&
        err.code === "runtime_match_not_found",
    );

    assert.equal(db.connection.rollback.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 0);

    const hasDomainMutation = executedQueries.some(
      (q) =>
        normalizeSql(q.sql).includes("UPDATE match_rooms") ||
        normalizeSql(q.sql).includes("UPDATE match_room_participants") ||
        normalizeSql(q.sql).includes("UPDATE match_server_assignments"),
    );
    assert.equal(hasDomainMutation, false);
  });

  test("14. series_end com assignment/resource ausente ou incompatível: lança 409 assignment_not_found, faz rollback e NÃO muta domínio", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[]];
      }
      if (norm.includes("INSERT INTO match_ingress_events")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ assignment_id: null, resource_server_key: null, match_edge_source_key: null })]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_SERIES_END_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "assignment_not_found",
    );

    assert.equal(db.connection.rollback.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 0);

    const hasDomainMutation = executedQueries.some(
      (q) =>
        normalizeSql(q.sql).includes("UPDATE match_rooms") ||
        normalizeSql(q.sql).includes("UPDATE match_room_participants") ||
        normalizeSql(q.sql).includes("UPDATE match_server_assignments"),
    );
    assert.equal(hasDomainMutation, false);
  });

  test("15. series_end em lifecycle diferente de JOINABLE/COMPLETED (ex: PROVISIONING, FORMING, FAILED): falha fechado com 409 invalid_room_lifecycle", async () => {
    for (const invalidStatus of ["PROVISIONING", "FORMING", "CONFIRMING", "SETUP", "READY", "CANCELLED", "FAILED"]) {
      const db = createMockDatabaseService(async (sql: string) => {
        const norm = normalizeSql(sql);

        if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
          return [[]];
        }
        if (norm.includes("INSERT INTO match_ingress_events")) {
          return [{ affectedRows: 1 }];
        }
        if (norm.includes("FROM competitive_matches cm")) {
          return [[createSampleMatchContext({ room_status: invalidStatus })]];
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const repo = new MatchIngressRepository(db);

      await assert.rejects(
        repo.saveEvent(VALID_SERIES_END_RECORD),
        (err: any) =>
          err instanceof MatchIngressError &&
          err.status === 409 &&
          err.code === "invalid_room_lifecycle",
      );

      assert.equal(db.connection.rollback.mock.calls.length, 1);
      assert.equal(db.connection.commit.mock.calls.length, 0);
    }
  });

  test("16. duplicate idêntico de series_end quando a sala já está COMPLETED: retorna duplicate=true e faz no-op seguro sem mutar version/completed_at", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[createSampleSeriesEndRow()]];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({
          room_status: "COMPLETED",
          room_completed_at: new Date("2026-08-16T15:00:01.000Z"),
          assignment_released_at: new Date("2026-08-16T15:00:01.000Z"),
          assignment_release_reason: "MATCH_COMPLETED",
        })]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_SERIES_END_RECORD);

    assert.deepEqual(result, { duplicate: true });
    assert.equal(db.connection.commit.mock.calls.length, 1);
    assert.equal(db.connection.rollback.mock.calls.length, 0);

    const hasMutation = executedQueries.some(
      (q) =>
        normalizeSql(q.sql).includes("UPDATE match_rooms") ||
        normalizeSql(q.sql).includes("UPDATE match_room_participants") ||
        normalizeSql(q.sql).includes("UPDATE match_server_assignments") ||
        normalizeSql(q.sql).includes("INSERT INTO match_ingress_events"),
    );
    assert.equal(hasMutation, false);
  });

  test("17. duplicate de series_end persistido + sala ainda JOINABLE: aplica projeção para COMPLETED e retorna duplicate=true", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[createSampleSeriesEndRow()]];
      }
      if (norm.includes("FROM competitive_matches cm")) {
        return [[createSampleMatchContext({ room_status: "JOINABLE" })]];
      }
      if (norm.includes("UPDATE match_rooms")) {
        return [{ affectedRows: 1 }];
      }
      if (norm.includes("UPDATE match_room_participants")) {
        return [{ affectedRows: 10 }];
      }
      if (norm.includes("UPDATE match_server_assignments")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);
    const result = await repo.saveEvent(VALID_SERIES_END_RECORD);

    assert.deepEqual(result, { duplicate: true });
    assert.equal(db.connection.commit.mock.calls.length, 1);
    assert.equal(db.connection.rollback.mock.calls.length, 0);

    const roomUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_rooms"));
    assert.ok(roomUpdate);
    assert.ok(normalizeSql(roomUpdate.sql).includes("status = 'COMPLETED'"));

    const participantUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_room_participants"));
    assert.ok(participantUpdate);
    assert.ok(normalizeSql(participantUpdate.sql).includes("release_reason = 'MATCH_COMPLETED'"));

    const assignmentUpdate = executedQueries.find((q) => normalizeSql(q.sql).includes("UPDATE match_server_assignments"));
    assert.ok(assignmentUpdate);
    assert.ok(normalizeSql(assignmentUpdate.sql).includes("release_reason = 'MATCH_COMPLETED'"));
  });

  test("18. series_end com payload divergente (idempotency conflict): lança 409, faz rollback e NÃO muta domínio", async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const db = createMockDatabaseService(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      const norm = normalizeSql(sql);

      if (norm.includes("FROM match_ingress_events WHERE source_key = ? AND edge_event_id = ?")) {
        return [[createSampleSeriesEndRow({ payload_sha256: "f".repeat(64) })]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const repo = new MatchIngressRepository(db);

    await assert.rejects(
      repo.saveEvent(VALID_SERIES_END_RECORD),
      (err: any) =>
        err instanceof MatchIngressError &&
        err.status === 409 &&
        err.code === "idempotency_conflict",
    );

    assert.equal(db.connection.rollback.mock.calls.length, 1);
    assert.equal(db.connection.commit.mock.calls.length, 0);

    const hasDomainQuery = executedQueries.some((q) => normalizeSql(q.sql).includes("FROM competitive_matches"));
    assert.equal(hasDomainQuery, false);
  });
});
