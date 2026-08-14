import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerAnalyticsAuthService } from "../../../../src/nest/internal/player-analytics/player-analytics-auth.service.js";
import { PlayerAnalyticsController } from "../../../../src/nest/internal/player-analytics/player-analytics.controller.js";
import { PlayerAnalyticsIngestService } from "../../../../src/nest/internal/player-analytics/player-analytics-ingest.service.js";
import { PlayerAnalyticsStatusService } from "../../../../src/nest/internal/player-analytics/player-analytics-status.service.js";
import { PlayerAnalyticsEventPublisherService } from "../../../../src/nest/internal/player-analytics/player-analytics-event-publisher.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const ingestResponse = {
  ok: true as const,
  generationId,
  state: "incoming" as const,
  packageSha256: "a".repeat(64),
  packageBytes: 7,
};

describe("Player Analytics HTTP contract", () => {
  let app: INestApplication | undefined;

  const authMock = {
    authorize: vi.fn(),
  } satisfies Pick<PlayerAnalyticsAuthService, "authorize">;

  const ingestMock = {
    maxPackageBytes: 1_000_000,
    ingest: vi.fn().mockResolvedValue(ingestResponse),
  } satisfies Pick<PlayerAnalyticsIngestService, "maxPackageBytes" | "ingest">;

  const statusMock = {
    get: vi.fn().mockResolvedValue({
      ok: true as const,
      generationId,
      state: "not_found" as const,
    }),
  } satisfies Pick<PlayerAnalyticsStatusService, "get">;

  const eventPublisherMock = {
    publishGenerationReceivedBestEffort: vi.fn(),
  } satisfies Pick<PlayerAnalyticsEventPublisherService, "publishGenerationReceivedBestEffort">;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlayerAnalyticsController],
      providers: [
        { provide: PlayerAnalyticsAuthService, useValue: authMock },
        { provide: PlayerAnalyticsIngestService, useValue: ingestMock },
        { provide: PlayerAnalyticsStatusService, useValue: statusMock },
        { provide: PlayerAnalyticsEventPublisherService, useValue: eventPublisherMock },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("wires PUT application/gzip e retorna 202 incoming", async () => {
    if (!app) throw new Error("test application was not initialized");
    const response = await request(app.getHttpServer())
      .put(`/internal/player-analytics/generations/${generationId}`)
      .set("x-hsc-player-analytics-key", "test-key")
      .set("Content-Type", "application/gzip")
      .send(Buffer.from("archive"))
      .expect(202);

    expect(response.body).toEqual(ingestResponse);
    expect(authMock.authorize).toHaveBeenCalledWith("test-key");
    expect(ingestMock.ingest).toHaveBeenCalledOnce();
    expect(eventPublisherMock.publishGenerationReceivedBestEffort).toHaveBeenCalledWith(ingestResponse);
  });

  it("wires GET e retorna o status mockado", async () => {
    if (!app) throw new Error("test application was not initialized");
    const response = await request(app.getHttpServer())
      .get(`/internal/player-analytics/generations/${generationId}`)
      .set("x-hsc-player-analytics-key", "test-key")
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      generationId,
      state: "not_found",
    });
    expect(statusMock.get).toHaveBeenCalledWith(generationId);
  });
});
