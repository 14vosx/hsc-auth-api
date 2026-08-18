import { describe, it, test, expect, vi, beforeEach, afterEach,  beforeEach, afterEach  } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { APP_CONFIG } from "../../../../src/nest/core/app-config.js";
import { DatabaseService } from "../../../../src/nest/database/database.service.js";
import { MatchIngressAuthService } from "../../../../src/nest/internal/match/match-ingress-auth.service.js";
import { MatchIngressController } from "../../../../src/nest/internal/match/match-ingress.controller.js";
import { MatchIngressRepository, type MatchIngressRow } from "../../../../src/nest/internal/match/match-ingress.repository.js";
import { MatchIngressService } from "../../../../src/nest/internal/match/match-ingress.service.js";

const VALID_KEY = "test-match-ingress-secret-key-32";
const VALID_SOURCE_KEY = "server01.sa-east-1";
const VALID_EDGE_EVENT_ID = "0123456789abcdef0123456789abcdef";
const VALID_EDGE_SEQUENCE = "100";
const VALID_EVENT_NAME = "map_start";
const VALID_RECEIVED_AT = "2026-08-16T14:00:00Z";

const samplePayload = {
  event: "map_start",
  map: "de_dust2",
  timestamp: "2026-08-16T14:00:00Z",
};
const sampleBuffer = Buffer.from(JSON.stringify(samplePayload), "utf-8");
const sampleSha256 = createHash("sha256").update(sampleBuffer).digest("hex");

function createMockAppConfig(configured = true, ingestKey = VALID_KEY) {
  return {
    matchIngress: {
      configured,
      ingestKey,
    },
  };
}

class InMemoryMatchIngressRepository {
  public store = new Map<string, MatchIngressRow>();

  async findBySourceAndEdgeEventId(
    sourceKey: string,
    edgeEventId: string,
  ): Promise<MatchIngressRow | null> {
    return this.store.get(`${sourceKey}:${edgeEventId}`) ?? null;
  }

  async saveEvent(record: any): Promise<{ duplicate: boolean }> {
    const key = `${record.sourceKey}:${record.edgeEventId}`;
    const existing = this.store.get(key);

    if (existing) {
      if (
        BigInt(record.edgeSequence) === BigInt(existing.edge_sequence) &&
        record.eventName === existing.event_name &&
        (record.localMatchId === null
          ? existing.local_matchid === null
          : existing.local_matchid !== null && BigInt(record.localMatchId) === BigInt(existing.local_matchid)) &&
        record.edgeReceivedAt === existing.edge_received_at &&
        record.payloadSha256 === existing.payload_sha256 &&
        record.payloadJsonText === existing.payload_json
      ) {
        return { duplicate: true };
      }
      throw new (await import("../../../../src/nest/internal/match/match-ingress-error.js")).MatchIngressError(
        409,
        "idempotency_conflict",
      );
    }

    const row: MatchIngressRow = {
      id: this.store.size + 1,
      source_key: record.sourceKey,
      edge_event_id: record.edgeEventId,
      edge_sequence: record.edgeSequence,
      event_name: record.eventName,
      local_matchid: record.localMatchId,
      edge_received_at: record.edgeReceivedAt,
      payload_json: record.payloadJsonText,
      payload_sha256: record.payloadSha256,
      ingested_at: new Date().toISOString(),
    } as MatchIngressRow;

    this.store.set(key, row);
    return { duplicate: false };
  }
}

describe("Match Ingress HTTP Suite", () => {
  let app: INestApplication;
  let repo: InMemoryMatchIngressRepository;

  const setupApp = async (configOverride = createMockAppConfig(), customRepo?: any) => {
    repo = customRepo ?? new InMemoryMatchIngressRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [MatchIngressController],
      providers: [
        { provide: APP_CONFIG, useValue: configOverride },
        { provide: DatabaseService, useValue: {} },
        MatchIngressAuthService,
        MatchIngressService,
        { provide: MatchIngressRepository, useValue: repo },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  };

  const teardownApp = async () => {
    if (app) {
      await app.close();
    }
  };

  test("503 se matchIngress não estiver configurado", async () => {
    await setupApp(createMockAppConfig(false, ""));
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", "any-key")
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);

    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { ok: false, error: "match_ingress_not_configured" });
    await teardownApp();
  });

  test("401 se X-HSC-Match-Ingest-Key estiver ausente ou incorreto", async () => {
    await setupApp();
    const res1 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);
    assert.equal(res1.status, 401);
    assert.deepEqual(res1.body, { ok: false, error: "invalid_match_ingress_key" });

    const res2 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", "wrong-key")
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);
    assert.equal(res2.status, 401);
    assert.deepEqual(res2.body, { ok: false, error: "invalid_match_ingress_key" });

    const res3 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", "short")
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);
    assert.equal(res3.status, 401);

    await teardownApp();
  });

  test("415 se Content-Type não for application/octet-stream", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/json")
      .send(sampleBuffer);

    assert.equal(res.status, 415);
    assert.deepEqual(res.body, { ok: false, error: "invalid_content_type" });
    await teardownApp();
  });

  test("400 se sourceKey for inválido", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/_invalid_source!/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "invalid_source_key" });
    await teardownApp();
  });

  test("400 se edgeEventId for inválido", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/not32hex`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "invalid_edge_event_id" });
    await teardownApp();
  });

  test("400 se edgeSequence for inválido ou <= 0", async () => {
    await setupApp();
    for (const invalidSeq of ["0", "-5", "abc", "1.5"]) {
      const res = await request(app.getHttpServer())
        .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
        .set("X-HSC-Match-Ingest-Key", VALID_KEY)
        .set("Content-Type", "application/octet-stream")
        .set("X-HSC-Edge-Sequence", invalidSeq)
        .set("X-HSC-Event-Name", VALID_EVENT_NAME)
        .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
        .set("X-HSC-Payload-Sha256", sampleSha256)
        .send(sampleBuffer);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { ok: false, error: "invalid_edge_sequence" });
    }
    await teardownApp();
  });

  test("400 se edgeReceivedAt for timestamp UTC inválido", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", "2026-08-16 14:00:00")
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "invalid_edge_received_at" });
    await teardownApp();
  });

  test("400 se payloadSha256 header não for 64 hex", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", "invalid-sha")
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "invalid_payload_sha256" });
    await teardownApp();
  });

  test("400 se recomputação central do SHA-256 divergir do header", async () => {
    await setupApp();
    const wrongSha = "0".repeat(64);
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", wrongSha)
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "sha256_mismatch" });
    await teardownApp();
  });

  test("413 se payload exceder 256 KiB durante streaming", async () => {
    await setupApp();
    const bigBuf = Buffer.alloc(256 * 1024 + 1, "a");
    const bigSha = createHash("sha256").update(bigBuf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", bigSha)
      .send(bigBuf);

    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { ok: false, error: "payload_too_large" });
    await teardownApp();
  });

  test("400 se UTF-8 for inválido (seqs de bytes malformadas)", async () => {
    await setupApp();
    const invalidUtf8Buf = Buffer.from([0x80, 0x81, 0x82, 0xff]);
    const invalidSha = createHash("sha256").update(invalidUtf8Buf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", invalidSha)
      .send(invalidUtf8Buf);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "malformed_utf8" });
    await teardownApp();
  });

  test("400 se JSON for malformado", async () => {
    await setupApp();
    const badJsonBuf = Buffer.from("{ invalid json", "utf-8");
    const badJsonSha = createHash("sha256").update(badJsonBuf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", badJsonSha)
      .send(badJsonBuf);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "malformed_json" });
    await teardownApp();
  });

  test("400 se JSON não for objeto top-level", async () => {
    await setupApp();
    const arrayJsonBuf = Buffer.from("[1, 2, 3]", "utf-8");
    const arraySha = createHash("sha256").update(arrayJsonBuf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", arraySha)
      .send(arrayJsonBuf);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "non_object_json" });
    await teardownApp();
  });

  test("400 se payload.event for diferente de X-HSC-Event-Name header", async () => {
    await setupApp();
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", "round_end")
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "event_mismatch" });
    await teardownApp();
  });

  test("series_end: 400 se matchid for ausente/inválido no payload", async () => {
    await setupApp();
    const badSeriesEndPayload = { event: "series_end", matchid: "42" }; // string invalid
    const buf = Buffer.from(JSON.stringify(badSeriesEndPayload));
    const sha = createHash("sha256").update(buf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", "series_end")
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sha)
      .set("X-HSC-Local-Match-Id", "42")
      .send(buf);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, error: "invalid_series_end_matchid" });
    await teardownApp();
  });

  test("series_end: 400 se X-HSC-Local-Match-Id estiver ausente ou divergente", async () => {
    await setupApp();
    const seriesEndPayload = { event: "series_end", matchid: 42 };
    const buf = Buffer.from(JSON.stringify(seriesEndPayload));
    const sha = createHash("sha256").update(buf).digest("hex");

    // Ausente
    const res1 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", "series_end")
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sha)
      .send(buf);

    assert.equal(res1.status, 400);
    assert.deepEqual(res1.body, { ok: false, error: "missing_local_match_id_header" });

    // Divergente
    const res2 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", "series_end")
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sha)
      .set("X-HSC-Local-Match-Id", "999")
      .send(buf);

    assert.equal(res2.status, 400);
    assert.deepEqual(res2.body, { ok: false, error: "series_end_matchid_mismatch" });

    await teardownApp();
  });

  test("202 e insere no primeiro PUT válido (eventos conhecidos e desconhecidos)", async () => {
    await setupApp();

    // Evento desconhecido
    const customPayload = { event: "custom_unknown_event", foo: "bar" };
    const buf = Buffer.from(JSON.stringify(customPayload));
    const sha = createHash("sha256").update(buf).digest("hex");

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", "custom_unknown_event")
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sha)
      .send(buf);

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, {
      ok: true,
      accepted: true,
      duplicate: false,
      sourceKey: VALID_SOURCE_KEY,
      edgeEventId: VALID_EDGE_EVENT_ID,
    });

    const stored = await repo.findBySourceAndEdgeEventId(VALID_SOURCE_KEY, VALID_EDGE_EVENT_ID);
    assert.ok(stored);
    assert.equal(stored.event_name, "custom_unknown_event");

    await teardownApp();
  });

  test("Retry idêntico retorna 202 com duplicate=true sem reinserir", async () => {
    await setupApp();

    // Ingestão 1
    const res1 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    assert.equal(res1.status, 202);
    assert.equal(res1.body.duplicate, false);

    // Ingestão 2 idêntica
    const res2 = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    assert.equal(res2.status, 202);
    assert.equal(res2.body.duplicate, true);

    await teardownApp();
  });

  test("Retry com payload/conteúdo diferente retorna 409 idempotency_conflict", async () => {
    await setupApp();

    // Ingestão 1
    await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    // Ingestão 2 com edgeSequence alterado mas mesmo (sourceKey, edgeEventId)
    const diffSeqPayload = sampleBuffer;
    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", "101") // Alterado
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(diffSeqPayload);

    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { ok: false, error: "idempotency_conflict" });

    await teardownApp();
  });

  test("Erro no DB retorna 500 storage_unavailable", async () => {
    const failingRepo = {
      async findBySourceAndEdgeEventId() {
        return null;
      },
      async saveEvent() {
        throw new Error("Database connection lost");
      },
    };
    await setupApp(createMockAppConfig(), failingRepo);

    const res = await request(app.getHttpServer())
      .put(`/internal/match/events/${VALID_SOURCE_KEY}/${VALID_EDGE_EVENT_ID}`)
      .set("X-HSC-Match-Ingest-Key", VALID_KEY)
      .set("Content-Type", "application/octet-stream")
      .set("X-HSC-Edge-Sequence", VALID_EDGE_SEQUENCE)
      .set("X-HSC-Event-Name", VALID_EVENT_NAME)
      .set("X-HSC-Edge-Received-At", VALID_RECEIVED_AT)
      .set("X-HSC-Payload-Sha256", sampleSha256)
      .send(sampleBuffer);

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, error: "storage_unavailable" });

    await teardownApp();
  });
});
