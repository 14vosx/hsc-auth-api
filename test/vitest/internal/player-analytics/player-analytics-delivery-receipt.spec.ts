import { expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../../../src/nest/core/app-config.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../../../../src/nest/internal/player-analytics/player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsStorageService } from "../../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const sha = "a".repeat(64);

async function fixture() {
  const root = await mkdtemp("/tmp/hsc-player-analytics-receipt-");
  const storage = new PlayerAnalyticsStorageService({ playerAnalytics: {
    configured: true, storageRoot: root, ingestKey: "key", maxPackageBytes: 100,
    maxExtractedBytes: 100, maxEntries: 10,
  } } as AppConfig);
  await storage.initialize();
  return { root, storage, receipts: new PlayerAnalyticsDeliveryReceiptService(storage) };
}

it("receipt - create/read, mode privado e shape estrito", async () => {
  const f = await fixture();
  try {
    const receipt = await f.receipts.ensure(generationId, sha, 123);
    expect(receipt).toEqual({ generationId, packageSha256: sha, packageBytes: 123, publishedAt: null, lifecycleState: "received" });
    expect(JSON.parse(await readFile(f.storage.deliveryPath(generationId), "utf8"))).toEqual(receipt);
    expect((await stat(f.storage.deliveryPath(generationId))).mode & 0o777).toBe(0o600);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("receipt - same hash/bytes é idempotente; divergência conflita", async () => {
  const f = await fixture();
  try {
    await f.receipts.ensure(generationId, sha, 123);
    await expect(f.receipts.ensure(generationId, sha, 123)).resolves.toMatchObject({ lifecycleState: "received" });
    await expect(f.receipts.ensure(generationId, "b".repeat(64), 123)).rejects.toMatchObject({ code: "generation_id_conflict" });
    await expect(f.receipts.ensure(generationId, sha, 124)).rejects.toMatchObject({ code: "generation_id_conflict" });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("receipt - publishedAt e lifecycle são atualizados atomicamente", async () => {
  const f = await fixture();
  try {
    await f.receipts.ensure(generationId, sha, 123);
    await f.receipts.markPublished(generationId, "2026-08-14T12:34:56.789Z");
    await f.receipts.markLifecycle(generationId, "accepted");
    expect(await f.receipts.read(generationId)).toMatchObject({
      publishedAt: "2026-08-14T12:34:56.789Z",
      lifecycleState: "accepted",
    });
    expect(await (await import("node:fs/promises")).readdir(path.join(f.root, "tmp", "metadata"))).toEqual([]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("receipt - rejeita JSON/shape inválido e symlink", async () => {
  const f = await fixture();
  try {
    await writeFile(f.storage.deliveryPath(generationId), "{}\n", { mode: 0o600 });
    await expect(f.receipts.read(generationId)).rejects.toMatchObject({ code: "player_analytics_storage_inconsistent" });
    await rm(f.storage.deliveryPath(generationId));
    const outside = path.join(f.root, "outside.json");
    await writeFile(outside, "{}\n");
    await symlink(outside, f.storage.deliveryPath(generationId));
    await expect(f.receipts.read(generationId)).rejects.toMatchObject({ code: "player_analytics_storage_inconsistent" });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
