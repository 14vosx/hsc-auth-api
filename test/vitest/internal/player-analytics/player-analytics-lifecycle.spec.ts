import { expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../../../src/nest/core/app-config.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../../../../src/nest/internal/player-analytics/player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsGenerationValidatorService } from "../../../../src/nest/internal/player-analytics/player-analytics-generation-validator.service.js";
import { PlayerAnalyticsLifecycleService } from "../../../../src/nest/internal/player-analytics/player-analytics-lifecycle.service.js";
import { PlayerAnalyticsStorageService } from "../../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";
import { buildGeneration, GENERATION_ID } from "./player-analytics-generation.fixture.js";

async function fixture(validator = new PlayerAnalyticsGenerationValidatorService()) {
  const root = await mkdtemp("/tmp/hsc-player-analytics-lifecycle-");
  const storage = new PlayerAnalyticsStorageService({ playerAnalytics: {
    configured: true, storageRoot: root, ingestKey: "key", maxPackageBytes: 100,
    maxExtractedBytes: 100, maxEntries: 10,
  } } as AppConfig);
  await storage.initialize();
  const receipts = new PlayerAnalyticsDeliveryReceiptService(storage);
  return { root, storage, receipts, lifecycle: new PlayerAnalyticsLifecycleService(storage, receipts, validator) };
}

async function received(f: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  await buildGeneration(f.storage.incomingPath(GENERATION_ID));
  await f.receipts.ensure(GENERATION_ID, "a".repeat(64), 123);
}

it("lifecycle - valid incoming vira accepted/current e replay current é idempotente", async () => {
  const f = await fixture();
  try {
    await received(f);
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("current");
    expect(await f.storage.status(GENERATION_ID)).toBe("current");
    expect(await f.receipts.read(GENERATION_ID)).toMatchObject({ lifecycleState: "accepted" });
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("current");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("lifecycle - invalid vira rejected, não muda current e replay é idempotente", async () => {
  const f = await fixture();
  try {
    await received(f);
    await writeFile(path.join(f.storage.incomingPath(GENERATION_ID), "unexpected"), "x");
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("rejected");
    expect(await f.storage.readCurrent()).toBeNull();
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("rejected");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("lifecycle - falha técnica do validator não move incoming para rejected", async () => {
  class TechnicalValidator extends PlayerAnalyticsGenerationValidatorService {
    override async validate(): Promise<never> { throw Object.assign(new Error("I/O"), { code: "EIO" }); }
  }
  const f = await fixture(new TechnicalValidator());
  try {
    await received(f);
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).rejects.toMatchObject({ code: "EIO" });
    expect(await f.storage.status(GENERATION_ID)).toBe("incoming");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("lifecycle - accepted após crash conclui activation e corrige receipt", async () => {
  const f = await fixture();
  try {
    await received(f);
    await f.storage.transition(f.storage.incomingPath(GENERATION_ID), f.storage.acceptedPath(GENERATION_ID));
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("current");
    expect(await f.receipts.read(GENERATION_ID)).toMatchObject({ lifecycleState: "accepted" });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("lifecycle - generatedAt mais antigo e empate com ID distinto não substituem current", async () => {
  for (const currentTime of ["2026-08-15T00:00:00Z", "2026-08-14T04:47:47Z"]) {
    const f = await fixture();
    try {
      await received(f);
      const currentId = "20260815T000000000000Z-aaaaaaaa";
      await mkdir(f.storage.acceptedPath(currentId), { recursive: true });
      await writeFile(path.join(f.storage.acceptedPath(currentId), "generation-manifest.json"), JSON.stringify({ generatedAt: currentTime }));
      await f.storage.writeCurrent(currentId);
      await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("accepted");
      expect(await f.storage.readCurrent()).toBe(currentId);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  }
});

it("lifecycle - candidate mais nova substitui current atomicamente", async () => {
  const f = await fixture();
  try {
    await received(f);
    const oldId = "20260813T000000000000Z-aaaaaaaa";
    await mkdir(f.storage.acceptedPath(oldId), { recursive: true });
    await writeFile(path.join(f.storage.acceptedPath(oldId), "generation-manifest.json"), JSON.stringify({ generatedAt: "2026-08-13T00:00:00Z" }));
    await f.storage.writeCurrent(oldId);
    await expect(f.lifecycle.processGeneration(GENERATION_ID)).resolves.toBe("current");
    expect(await f.storage.readCurrent()).toBe(GENERATION_ID);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("retention - preserva current e cinco accepted mais novas por generatedAt, mantendo receipts", async () => {
  const f = await fixture();
  try {
    const ids = Array.from({ length: 8 }, (_, index) => `202608${String(index + 1).padStart(2, "0")}T000000000000Z-${String(index).padStart(8, "0")}`);
    for (const [index, id] of ids.entries()) {
      await mkdir(f.storage.acceptedPath(id), { recursive: true });
      await writeFile(path.join(f.storage.acceptedPath(id), "generation-manifest.json"), JSON.stringify({ generatedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z` }));
      await f.receipts.ensure(id, String(index).repeat(64), 100 + index);
      await f.receipts.markLifecycle(id, "accepted");
    }
    await f.storage.writeCurrent(ids[0]);
    await expect(f.lifecycle.processGeneration(ids[0])).resolves.toBe("current");
    expect((await f.storage.listAccepted()).sort()).toEqual([ids[0], ...ids.slice(3)].sort());
    expect(await f.receipts.read(ids[1])).toMatchObject({ lifecycleState: "accepted" });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
