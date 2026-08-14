import { Logger } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG, type AppConfig } from "../../../../src/nest/core/app-config.js";
import { PlayerAnalyticsEventPublisherService } from "../../../../src/nest/internal/player-analytics/player-analytics-event-publisher.service.js";
import {
  EVENTS_EXCHANGE,
  PLAYER_ANALYTICS_GENERATION_RECEIVED,
} from "../../../../src/nest/messaging/rabbitmq.constants.js";
import { RabbitMqClientService } from "../../../../src/nest/messaging/rabbitmq-client.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../../../../src/nest/internal/player-analytics/player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsStorageService } from "../../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const result = {
  ok: true as const,
  generationId,
  state: "incoming" as const,
  packageSha256: "a".repeat(64),
  packageBytes: 123,
};

describe("PlayerAnalyticsEventPublisherService", () => {
  let moduleRef: TestingModule | undefined;
  let publisher!: PlayerAnalyticsEventPublisherService;
  const rabbitClientMock = {
    publishConfirmed: vi.fn(),
  } satisfies Pick<RabbitMqClientService, "publishConfirmed">;
  const receiptMock = {
    read: vi.fn(),
    markPublishedWithinLock: vi.fn(),
  } satisfies Pick<PlayerAnalyticsDeliveryReceiptService, "read" | "markPublishedWithinLock">;
  const withLifecycleLock = async <T>(
    _generationId: string,
    operation: () => Promise<T>,
  ): Promise<T> => operation();
  const storageMock = {
    withLifecycleLock,
  } satisfies Pick<PlayerAnalyticsStorageService, "withLifecycleLock">;

  async function configure(configured: boolean): Promise<void> {
    moduleRef = await Test.createTestingModule({
      providers: [
        PlayerAnalyticsEventPublisherService,
        { provide: APP_CONFIG, useValue: { rabbitMq: { configured, url: configured ? "amqp://test" : "", connectTimeoutMs: 2_000 } } as AppConfig },
        { provide: RabbitMqClientService, useValue: rabbitClientMock },
        { provide: PlayerAnalyticsDeliveryReceiptService, useValue: receiptMock },
        { provide: PlayerAnalyticsStorageService, useValue: storageMock },
      ],
    }).compile();
    publisher = moduleRef.get(PlayerAnalyticsEventPublisherService);
    receiptMock.read.mockResolvedValue({
      generationId,
      packageSha256: result.packageSha256,
      packageBytes: result.packageBytes,
      publishedAt: null,
      lifecycleState: "received",
    });
    receiptMock.markPublishedWithinLock.mockResolvedValue(undefined);
  }

  afterEach(async () => {
    vi.useRealTimers();
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("publica payload e AMQP properties exatos sem filesystem path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:34:56.789Z"));
    rabbitClientMock.publishConfirmed.mockResolvedValueOnce(undefined);
    await configure(true);

    publisher.publishGenerationReceivedBestEffort(result);
    await Promise.resolve();
    await Promise.resolve();

    expect(rabbitClientMock.publishConfirmed).toHaveBeenCalledOnce();
    const published = rabbitClientMock.publishConfirmed.mock.calls[0][0];
    expect(published.exchange).toBe(EVENTS_EXCHANGE);
    expect(published.routingKey).toBe(PLAYER_ANALYTICS_GENERATION_RECEIVED);
    expect(JSON.parse(published.content.toString("utf8"))).toEqual({
      event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
      generationId,
      packageSha256: result.packageSha256,
      packageBytes: 123,
      receivedAt: "2026-08-14T12:34:56.789Z",
    });
    expect(published.content.toString("utf8")).not.toContain("Path");
    expect(published.options).toEqual({
      contentType: "application/json",
      type: PLAYER_ANALYTICS_GENERATION_RECEIVED,
      messageId: generationId,
      appId: "hsc-auth-api",
      persistent: true,
      timestamp: Math.floor(new Date("2026-08-14T12:34:56.789Z").getTime() / 1_000),
    });
    await Promise.resolve();
    expect(receiptMock.markPublishedWithinLock).toHaveBeenCalledWith(
      generationId,
      "2026-08-14T12:34:56.789Z",
    );
  });

  it("absorve failure sem unhandled e sem propagar para caller", async () => {
    let signalWarning!: () => void;
    const warningCalled = new Promise<void>((resolve) => {
      signalWarning = resolve;
    });
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {
      signalWarning();
    });
    rabbitClientMock.publishConfirmed.mockRejectedValueOnce(new Error("amqp://secret@broker"));
    await configure(true);

    expect(() => publisher.publishGenerationReceivedBestEffort(result)).not.toThrow();
    await warningCalled;
    expect(warn).toHaveBeenCalledWith("Player Analytics event publish failed");
  });

  it("é no-op quando Rabbit não está configurado", async () => {
    await configure(false);
    publisher.publishGenerationReceivedBestEffort(result);
    expect(rabbitClientMock.publishConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    ["already-published", { publishedAt: "2026-08-14T12:00:00Z", lifecycleState: "received" }],
    ["accepted", { publishedAt: null, lifecycleState: "accepted" }],
    ["rejected", { publishedAt: null, lifecycleState: "rejected" }],
  ] as const)("não republica receipt inelegível: %s", async (_label, eligibility) => {
    await configure(true);
    receiptMock.read.mockResolvedValueOnce({
      generationId,
      packageSha256: result.packageSha256,
      packageBytes: result.packageBytes,
      ...eligibility,
    });
    publisher.publishGenerationReceivedBestEffort(result);
    await Promise.resolve();
    expect(rabbitClientMock.publishConfirmed).not.toHaveBeenCalled();
  });

  it("Rabbit failure mantém publishedAt null", async () => {
    rabbitClientMock.publishConfirmed.mockRejectedValueOnce(new Error("down"));
    await configure(true);
    publisher.publishGenerationReceivedBestEffort(result);
    await Promise.resolve();
    await Promise.resolve();
    expect(receiptMock.markPublishedWithinLock).not.toHaveBeenCalled();
  });
});
