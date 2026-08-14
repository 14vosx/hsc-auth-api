import { HttpException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerAnalyticsAuthService } from "../../../../src/nest/internal/player-analytics/player-analytics-auth.service.js";
import { PlayerAnalyticsController } from "../../../../src/nest/internal/player-analytics/player-analytics.controller.js";
import { PlayerAnalyticsIngestService } from "../../../../src/nest/internal/player-analytics/player-analytics-ingest.service.js";
import { PlayerAnalyticsStatusService } from "../../../../src/nest/internal/player-analytics/player-analytics-status.service.js";
import { PlayerAnalyticsEventPublisherService } from "../../../../src/nest/internal/player-analytics/player-analytics-event-publisher.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const request = {} as IncomingMessage;

describe("PlayerAnalyticsController", () => {
  let moduleRef: TestingModule | undefined;
  let controller!: PlayerAnalyticsController;

  const authMock = {
    authorize: vi.fn(),
  } satisfies Pick<PlayerAnalyticsAuthService, "authorize">;

  const ingestMock = {
    maxPackageBytes: 100,
    ingest: vi.fn(),
  } satisfies Pick<PlayerAnalyticsIngestService, "maxPackageBytes" | "ingest">;

  const statusMock = {
    get: vi.fn(),
  } satisfies Pick<PlayerAnalyticsStatusService, "get">;

  const eventPublisherMock = {
    publishGenerationReceivedBestEffort: vi.fn(),
  } satisfies Pick<PlayerAnalyticsEventPublisherService, "publishGenerationReceivedBestEffort">;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [PlayerAnalyticsController],
      providers: [
        { provide: PlayerAnalyticsAuthService, useValue: authMock },
        { provide: PlayerAnalyticsIngestService, useValue: ingestMock },
        { provide: PlayerAnalyticsStatusService, useValue: statusMock },
        { provide: PlayerAnalyticsEventPublisherService, useValue: eventPublisherMock },
      ],
    }).compile();
    controller = moduleRef.get(PlayerAnalyticsController);
  });

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("rejeita content type inválido", async () => {
    const action = controller.put(
      generationId,
      "key",
      "application/json",
      undefined,
      request,
    );

    await expect(action).rejects.toBeInstanceOf(HttpException);
    await action.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(415);
    });
    expect(ingestMock.ingest).not.toHaveBeenCalled();
  });

  it("rejeita Content-Length acima do limite", async () => {
    const action = controller.put(
      generationId,
      "key",
      "application/gzip",
      "101",
      request,
    );

    await expect(action).rejects.toBeInstanceOf(HttpException);
    await action.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(413);
    });
    expect(ingestMock.ingest).not.toHaveBeenCalled();
  });

  it("publica best-effort após ingest e retorna o mesmo resultado", async () => {
    const result = {
      ok: true as const,
      generationId,
      state: "incoming" as const,
      packageSha256: "a".repeat(64),
      packageBytes: 7,
    };
    ingestMock.ingest.mockResolvedValueOnce(result);

    await expect(controller.put(
      generationId,
      "key",
      "application/gzip",
      undefined,
      request,
    )).resolves.toBe(result);
    expect(eventPublisherMock.publishGenerationReceivedBestEffort).toHaveBeenCalledWith(result);
  });
});
