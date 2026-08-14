import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG, type AppConfig } from "../../../src/nest/core/app-config.js";
import { PlayerAnalyticsEventPublisherService } from "../../../src/nest/internal/player-analytics/player-analytics-event-publisher.service.js";
import { PlayerAnalyticsStorageService } from "../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";
import { PlayerAnalyticsReconciliationService } from "../../../src/nest/player-analytics-worker/player-analytics-reconciliation.service.js";

const ids = [
  "20260814T044747694837Z-0d00de77",
  "20260815T044747694837Z-0d00de78",
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

describe("PlayerAnalyticsReconciliationService", () => {
  let moduleRef: TestingModule;
  let service: PlayerAnalyticsReconciliationService;
  const runtimeConfig = { playerAnalytics: { reconciliationIntervalMs: 30_000 } };
  const storage = { initialize: vi.fn(), listIncoming: vi.fn() };
  const publisher = { publishGenerationReceivedIfEligible: vi.fn() };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({ providers: [
      PlayerAnalyticsReconciliationService,
      { provide: APP_CONFIG, useValue: runtimeConfig as AppConfig },
      { provide: PlayerAnalyticsStorageService, useValue: storage },
      { provide: PlayerAnalyticsEventPublisherService, useValue: publisher },
    ] }).compile();
    service = moduleRef.get(PlayerAnalyticsReconciliationService);
    storage.initialize.mockResolvedValue(undefined);
    storage.listIncoming.mockResolvedValue([]);
    publisher.publishGenerationReceivedIfEligible.mockResolvedValue("published");
    runtimeConfig.playerAnalytics.reconciliationIntervalMs = 30_000;
  });

  afterEach(async () => {
    await moduleRef.close();
    vi.useRealTimers();
  });

  it("empty incoming retorna summary zero", async () => {
    await expect(service.reconcileOnce()).resolves.toEqual({ scanned: 0, published: 0, skipped: 0, failed: 0 });
  });

  it("processa candidates sequencialmente", async () => {
    storage.listIncoming.mockResolvedValueOnce(ids);
    const first = deferred<"published">();
    publisher.publishGenerationReceivedIfEligible
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce("published");
    const pass = service.reconcileOnce();
    await Promise.resolve();
    expect(publisher.publishGenerationReceivedIfEligible).toHaveBeenCalledTimes(1);
    first.resolve("published");
    await expect(pass).resolves.toEqual({ scanned: 2, published: 2, skipped: 0, failed: 0 });
  });

  it.each(["already-published", "terminal", "not-incoming"] as const)("resultado %s é skipped", async (result) => {
    storage.listIncoming.mockResolvedValueOnce([ids[0]]);
    publisher.publishGenerationReceivedIfEligible.mockResolvedValueOnce(result);
    await expect(service.reconcileOnce()).resolves.toMatchObject({ scanned: 1, skipped: 1, published: 0 });
  });

  it("não ressuscita DLQ: publishedAt representado por already-published nunca republica", async () => {
    storage.listIncoming.mockResolvedValueOnce([ids[0]]);
    publisher.publishGenerationReceivedIfEligible.mockResolvedValueOnce("already-published");
    await expect(service.reconcileOnce()).resolves.toEqual({ scanned: 1, published: 0, skipped: 1, failed: 0 });
    expect(publisher.publishGenerationReceivedIfEligible).toHaveBeenCalledOnce();
  });

  it("isola falha por generation e continua", async () => {
    storage.listIncoming.mockResolvedValueOnce(ids);
    publisher.publishGenerationReceivedIfEligible
      .mockRejectedValueOnce(new Error("Rabbit down"))
      .mockResolvedValueOnce("published");
    await expect(service.reconcileOnce()).resolves.toEqual({ scanned: 2, published: 1, skipped: 0, failed: 1 });
  });

  it("falha global de listagem rejeita reconcileOnce e startup", async () => {
    storage.listIncoming.mockRejectedValue(new Error("EIO"));
    await expect(service.reconcileOnce()).rejects.toThrow("EIO");
    await expect(service.start()).rejects.toThrow("EIO");
  });

  it("scheduler não sobrepõe passes e stop cancela próxima execução", async () => {
    vi.useFakeTimers();
    const periodic = deferred<{ scanned: number; published: number; skipped: number; failed: number }>();
    const reconcile = vi.spyOn(service, "reconcileOnce")
      .mockResolvedValueOnce({ scanned: 0, published: 0, skipped: 0, failed: 0 })
      .mockReturnValueOnce(periodic.promise);
    await service.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    periodic.resolve({ scanned: 0, published: 0, skipped: 0, failed: 0 });
    await Promise.resolve();
    service.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("scheduler honra intervalo configurado", async () => {
    vi.useFakeTimers();
    runtimeConfig.playerAnalytics.reconciliationIntervalMs = 5_000;
    const reconcile = vi.spyOn(service, "reconcileOnce")
      .mockResolvedValue({ scanned: 0, published: 0, skipped: 0, failed: 0 });
    await service.start();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(reconcile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("falha global periódica sinaliza fatal comum", async () => {
    vi.useFakeTimers();
    vi.spyOn(service, "reconcileOnce")
      .mockResolvedValueOnce({ scanned: 0, published: 0, skipped: 0, failed: 0 })
      .mockRejectedValueOnce(new Error("EIO"));
    await service.start();
    const fatal = service.waitForFatal();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(fatal).resolves.toBeUndefined();
  });
});
