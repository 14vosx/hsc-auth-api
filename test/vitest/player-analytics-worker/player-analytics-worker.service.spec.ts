import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG, type AppConfig } from "../../../src/nest/core/app-config.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../../../src/nest/internal/player-analytics/player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsLifecycleService } from "../../../src/nest/internal/player-analytics/player-analytics-lifecycle.service.js";
import {
  RabbitMqConsumerClientService,
  type RabbitMqConsumerDelivery,
} from "../../../src/nest/messaging/rabbitmq-consumer-client.service.js";
import { PLAYER_ANALYTICS_GENERATION_RECEIVED } from "../../../src/nest/messaging/rabbitmq.constants.js";
import { PlayerAnalyticsWorkerService } from "../../../src/nest/player-analytics-worker/player-analytics-worker.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const payload = {
  event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
  generationId,
  packageSha256: "a".repeat(64),
  packageBytes: 123,
  receivedAt: "2026-08-14T18:00:00.000Z",
};

describe("PlayerAnalyticsWorkerService", () => {
  let moduleRef: TestingModule;
  let worker: PlayerAnalyticsWorkerService;
  let handler!: (delivery: RabbitMqConsumerDelivery) => Promise<void>;
  const consumer = {
    start: vi.fn(async (value: (delivery: RabbitMqConsumerDelivery) => Promise<void>) => { handler = value; }),
    waitForFatal: vi.fn(() => new Promise<void>(() => undefined)),
  };
  const receipts = { read: vi.fn() };
  const lifecycle = { processGeneration: vi.fn() };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({ providers: [
      PlayerAnalyticsWorkerService,
      { provide: APP_CONFIG, useValue: { playerAnalytics: { storageRoot: "/storage" }, rabbitMq: { configured: true } } as AppConfig },
      { provide: RabbitMqConsumerClientService, useValue: consumer },
      { provide: PlayerAnalyticsDeliveryReceiptService, useValue: receipts },
      { provide: PlayerAnalyticsLifecycleService, useValue: lifecycle },
    ] }).compile();
    worker = moduleRef.get(PlayerAnalyticsWorkerService);
    receipts.read.mockResolvedValue({ packageSha256: payload.packageSha256, packageBytes: 123 });
    lifecycle.processGeneration.mockResolvedValue("accepted");
    await worker.start();
  });

  afterEach(async () => moduleRef.close());

  function delivery(overrides: Partial<typeof payload> = {}) {
    const ack = vi.fn(); const reject = vi.fn();
    return {
      value: {
        message: {
          content: Buffer.from(JSON.stringify({ ...payload, ...overrides })),
          fields: { routingKey: PLAYER_ANALYTICS_GENERATION_RECEIVED },
          properties: { type: PLAYER_ANALYTICS_GENERATION_RECEIVED, messageId: overrides.generationId ?? generationId },
        }, ack, reject,
      } satisfies RabbitMqConsumerDelivery,
      ack, reject,
    };
  }

  it.each(["accepted", "current", "rejected"] as const)("ACK para lifecycle %s", async (result) => {
    lifecycle.processGeneration.mockResolvedValueOnce(result);
    const item = delivery(); await handler(item.value);
    expect(item.ack).toHaveBeenCalledOnce(); expect(item.reject).not.toHaveBeenCalled();
  });

  it("reject(true) para falha técnica", async () => {
    lifecycle.processGeneration.mockRejectedValueOnce(new Error("EIO"));
    const item = delivery(); await handler(item.value);
    expect(item.reject).toHaveBeenCalledWith(true); expect(item.ack).not.toHaveBeenCalled();
  });

  it("reject(false) para malformed sem chamar lifecycle", async () => {
    const item = delivery({ packageBytes: 0 }); await handler(item.value);
    expect(item.reject).toHaveBeenCalledWith(false); expect(item.ack).not.toHaveBeenCalled();
    expect(lifecycle.processGeneration).not.toHaveBeenCalled();
  });

  it.each(["sha", "bytes"] as const)("reject(false) para receipt mismatch: %s", async (field) => {
    receipts.read.mockResolvedValueOnce({
      packageSha256: field === "sha" ? "b".repeat(64) : payload.packageSha256,
      packageBytes: field === "bytes" ? 124 : 123,
    });
    const item = delivery(); await handler(item.value);
    expect(item.reject).toHaveBeenCalledWith(false); expect(lifecycle.processGeneration).not.toHaveBeenCalled();
  });

  it.each(["missing", "read-failure"] as const)("reject(true) para receipt %s", async (kind) => {
    if (kind === "missing") receipts.read.mockResolvedValueOnce(null);
    else receipts.read.mockRejectedValueOnce(new Error("EACCES"));
    const item = delivery(); await handler(item.value);
    expect(item.reject).toHaveBeenCalledWith(true); expect(lifecycle.processGeneration).not.toHaveBeenCalled();
  });
});

it.each([
  ["Rabbit", { playerAnalytics: { storageRoot: "/storage" }, rabbitMq: { configured: false } }],
  ["storageRoot", { playerAnalytics: { storageRoot: "" }, rabbitMq: { configured: true } }],
] as const)("startup falha sem %s", async (_label, config) => {
  const consumer = { start: vi.fn(), waitForFatal: vi.fn() };
  const moduleRef = await Test.createTestingModule({ providers: [
    PlayerAnalyticsWorkerService,
    { provide: APP_CONFIG, useValue: config as AppConfig },
    { provide: RabbitMqConsumerClientService, useValue: consumer },
    { provide: PlayerAnalyticsDeliveryReceiptService, useValue: { read: vi.fn() } },
    { provide: PlayerAnalyticsLifecycleService, useValue: { processGeneration: vi.fn() } },
  ] }).compile();
  try {
    await expect(moduleRef.get(PlayerAnalyticsWorkerService).start()).rejects.toThrow(
      "Player Analytics worker configuration is incomplete",
    );
    expect(consumer.start).not.toHaveBeenCalled();
  } finally { await moduleRef.close(); }
});
