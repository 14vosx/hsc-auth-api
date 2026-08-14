import { expect, it } from "vitest";
import { createReadStream } from "node:fs";
import { copyFile, link, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { create } from "tar";
import type { IncomingMessage } from "node:http";
import type { AppConfig } from "../../../../src/nest/core/app-config.js";
import { archivePathIsSafe, PlayerAnalyticsIngestService } from "../../../../src/nest/internal/player-analytics/player-analytics-ingest.service.js";
import { PlayerAnalyticsStorageService } from "../../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../../../../src/nest/internal/player-analytics/player-analytics-delivery-receipt.service.js";

const generationId = "20260814T044747694837Z-0d00de77";

interface Fixture {
  root: string;
  source: string;
  storage: PlayerAnalyticsStorageService;
  receipts: PlayerAnalyticsDeliveryReceiptService;
  ingest: PlayerAnalyticsIngestService;
}

async function fixture(overrides: Partial<AppConfig["playerAnalytics"]> = {}): Promise<Fixture> {
  const root = await mkdtemp("/tmp/hsc-player-analytics-ingest-");
  const source = path.join(root, "source");
  await mkdir(source);
  const playerAnalytics = {
    configured: true, storageRoot: path.join(root, "storage"), ingestKey: "key",
    maxPackageBytes: 1_000_000, maxExtractedBytes: 1_000_000, maxEntries: 100,
    ...overrides,
  };
  const config = { playerAnalytics } as AppConfig;
  const storage = new PlayerAnalyticsStorageService(config);
  const receipts = new PlayerAnalyticsDeliveryReceiptService(storage);
  return {
    root,
    source,
    storage,
    receipts,
    ingest: new PlayerAnalyticsIngestService(
      config,
      storage,
      receipts,
    ),
  };
}

async function packageFrom(f: Fixture, manifest: string | undefined, extraFiles = 0): Promise<string> {
  if (manifest !== undefined) await writeFile(path.join(f.source, "generation-manifest.json"), manifest);
  for (let index = 0; index < extraFiles; index += 1) {
    await writeFile(path.join(f.source, `entry-${index}.json`), "{}");
  }
  const target = path.join(f.root, `package-${Math.random()}.tar.gz`);
  await create({ cwd: f.source, file: target, gzip: true }, await readdir(f.source));
  return target;
}

async function packageFromEntries(f: Fixture, entries: string[]): Promise<string> {
  const target = path.join(f.root, `package-${Math.random()}.tar.gz`);
  await create({
    cwd: f.source,
    file: target,
    gzip: true,
    jobs: 1,
  }, entries);
  return target;
}

function requestFrom(target: string): IncomingMessage {
  return createReadStream(target, { highWaterMark: 7 }) as unknown as IncomingMessage;
}

async function expectCode(action: Promise<unknown>, code: string): Promise<void> {
  await expect(action).rejects.toEqual(expect.objectContaining({ code }));
}

it("ingest - package válido faz streaming, produz SHA-256 e promove para incoming", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    const result = await f.ingest.ingest(requestFrom(archive), generationId);
    expect(result.state).toBe("incoming");
    expect(result.packageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.packageBytes).toBeGreaterThan(0);
    expect(await f.storage.exists(f.storage.incomingPath(generationId))).toBe(true);
    expect(await f.storage.exists(f.storage.packagePath(generationId))).toBe(true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - traversal e paths absolutos são rejeitados na inspeção", () => {
  expect(archivePathIsSafe("../escape.json")).toBe(false);
  expect(archivePathIsSafe("safe/../../escape.json")).toBe(false);
  expect(archivePathIsSafe("/absolute.json")).toBe(false);
  expect(archivePathIsSafe("C:\\absolute.json")).toBe(false);
  expect(archivePathIsSafe("./safe/file.json")).toBe(true);
});

it("ingest - max package bytes e partial cleanup", async () => {
  const f = await fixture({ maxPackageBytes: 10 });
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "package_too_large");
    expect(await readdir(path.join(f.storage.root, "tmp", "uploads"))).toEqual([]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - manifest ausente e extract cleanup", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, undefined, 1);
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "generation_manifest_missing");
    expect(await readdir(path.join(f.storage.root, "tmp", "extract"))).toEqual([]);
    expect(await f.storage.exists(f.storage.incomingPath(generationId))).toBe(false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - manifest JSON inválido", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, "{");
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "generation_manifest_invalid");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - manifest generationId mismatch", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId: "20260814T044747694837Z-aaaaaaaa" }));
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "generation_id_mismatch");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - entry count excedido", async () => {
  const f = await fixture({ maxEntries: 1 });
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }), 1);
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "unsafe_archive");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - extracted bytes declarados excedidos", async () => {
  const f = await fixture({ maxExtractedBytes: 4 });
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "invalid_package");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - symlink rejeitado", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.source, "generation-manifest.json"),
      JSON.stringify({ generationId }),
    );
    await writeFile(path.join(f.source, "target"), "data");
    await (await import("node:fs/promises")).symlink("target", path.join(f.source, "link"));
    const archive = await packageFromEntries(f, ["generation-manifest.json", "link"]);
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "unsafe_archive");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - hardlink rejeitado", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.source, "generation-manifest.json"),
      JSON.stringify({ generationId }),
    );
    await writeFile(path.join(f.source, "target"), "data");
    await link(path.join(f.source, "target"), path.join(f.source, "hardlink"));
    const archive = await packageFromEntries(f, ["generation-manifest.json", "target", "hardlink"]);
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "unsafe_archive");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - mesma generation e mesmo package é idempotente", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    const first = await f.ingest.ingest(requestFrom(archive), generationId);
    const originalReceivedAt = (await f.receipts.read(generationId))?.receivedAt;
    const second = await f.ingest.ingest(requestFrom(archive), generationId);
    expect(second.packageSha256).toBe(first.packageSha256);
    expect((await f.receipts.read(generationId))?.receivedAt).toBe(originalReceivedAt);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - mesma generation e package diferente conflita", async () => {
  const f = await fixture();
  try {
    const first = await packageFrom(f, JSON.stringify({ generationId }));
    await f.ingest.ingest(requestFrom(first), generationId);
    await writeFile(path.join(f.source, "different"), "content");
    const second = await packageFrom(f, JSON.stringify({ generationId }));
    await expectCode(f.ingest.ingest(requestFrom(second), generationId), "generation_id_conflict");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it.each(["accepted", "current", "rejected"] as const)(
  "ingest - package idêntico em lifecycle terminal retorna %s sem conflito",
  async (terminalState) => {
    const f = await fixture();
    try {
      const archive = await packageFrom(f, JSON.stringify({ generationId }));
      await f.ingest.ingest(requestFrom(archive), generationId);
      const originalReceivedAt = (await f.receipts.read(generationId))?.receivedAt;
      const destination = terminalState === "rejected"
        ? f.storage.rejectedPath(generationId)
        : f.storage.acceptedPath(generationId);
      await f.storage.transition(f.storage.incomingPath(generationId), destination);
      await f.receipts.markLifecycle(generationId, terminalState === "rejected" ? "rejected" : "accepted");
      if (terminalState === "current") await f.storage.writeCurrent(generationId);
      expect((await f.ingest.ingest(requestFrom(archive), generationId)).state).toBe(terminalState);
      expect((await f.receipts.read(generationId))?.receivedAt).toBe(originalReceivedAt);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  },
);

it("ingest - accepted podada permanece historicamente idempotente pelo receipt", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await f.ingest.ingest(requestFrom(archive), generationId);
    await f.storage.transition(f.storage.incomingPath(generationId), f.storage.acceptedPath(generationId));
    await f.receipts.markLifecycle(generationId, "accepted");
    await f.storage.remove(f.storage.acceptedPath(generationId));
    expect((await f.ingest.ingest(requestFrom(archive), generationId)).state).toBe("accepted");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - receipt received + staging package retoma promoção para incoming", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await f.storage.initialize();
    await copyFile(archive, f.storage.packagePath(generationId));
    const metadata = await (await import("node:fs/promises")).stat(archive);
    await f.receipts.ensure(generationId, await f.storage.sha256(f.storage.packagePath(generationId)), metadata.size, "2026-08-14T12:00:00.000Z");
    expect((await f.ingest.ingest(requestFrom(archive), generationId)).state).toBe("incoming");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - receipt received sem staging/incoming é falha técnica", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    const metadata = await (await import("node:fs/promises")).stat(archive);
    await f.storage.initialize();
    await copyFile(archive, f.storage.packagePath(generationId));
    const sha = await f.storage.sha256(f.storage.packagePath(generationId));
    await f.receipts.ensure(generationId, sha, metadata.size, "2026-08-14T12:00:00.000Z");
    await f.storage.remove(f.storage.packagePath(generationId));
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "player_analytics_storage_inconsistent");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - incoming sem package é inconsistente e não é reparado", async () => {
  const f = await fixture();
  try {
    await f.storage.initialize();
    await mkdir(f.storage.incomingPath(generationId));
    await writeFile(path.join(f.storage.incomingPath(generationId), "sentinel"), "preserve");
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await expectCode(
      f.ingest.ingest(requestFrom(archive), generationId),
      "player_analytics_storage_inconsistent",
    );
    expect(await f.storage.exists(f.storage.packagePath(generationId))).toBe(false);
    expect(await f.storage.exists(path.join(f.storage.incomingPath(generationId), "sentinel"))).toBe(true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - incoming com package de mesmo hash é idempotente", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await f.storage.initialize();
    await mkdir(f.storage.incomingPath(generationId));
    await copyFile(archive, f.storage.packagePath(generationId));
    const packageBytes = (await (await import("node:fs/promises")).stat(archive)).size;
    const packageSha256 = await f.storage.sha256(f.storage.packagePath(generationId));
    await f.receipts.ensure(generationId, packageSha256, packageBytes, "2026-08-14T12:00:00.000Z");
    const result = await f.ingest.ingest(requestFrom(archive), generationId);
    expect(result.state).toBe("incoming");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - incoming com package de hash diferente conflita", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await f.storage.initialize();
    await mkdir(f.storage.incomingPath(generationId));
    await writeFile(f.storage.packagePath(generationId), "different-package");
    await f.receipts.ensure(generationId, "b".repeat(64), 17, "2026-08-14T12:00:00.000Z");
    await expectCode(f.ingest.ingest(requestFrom(archive), generationId), "generation_id_conflict");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - uploads concorrentes convergem sem sobrescrever incoming", async () => {
  const f = await fixture();
  try {
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    const [first, second] = await Promise.all([
      f.ingest.ingest(requestFrom(archive), generationId),
      f.ingest.ingest(requestFrom(archive), generationId),
    ]);
    expect(first.packageSha256).toBe(second.packageSha256);
    expect(await f.storage.exists(f.storage.incomingPath(generationId))).toBe(true);
    expect(
      JSON.parse(await (await import("node:fs/promises")).readFile(
        path.join(f.storage.incomingPath(generationId), "generation-manifest.json"),
        "utf8",
      )).generationId,
    ).toBe(generationId);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("ingest - destination vazio preexistente nunca é sobrescrito", async () => {
  const f = await fixture();
  try {
    await f.storage.initialize();
    await mkdir(f.storage.incomingPath(generationId));
    const archive = await packageFrom(f, JSON.stringify({ generationId }));
    await expectCode(
      f.ingest.ingest(requestFrom(archive), generationId),
      "player_analytics_storage_inconsistent",
    );
    expect(await readdir(f.storage.incomingPath(generationId))).toEqual([]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

function failingRequest(aborted: boolean): IncomingMessage {
  let emitted = false;
  const stream = new Readable({
    read() {
      if (emitted) return;
      emitted = true;
      this.push(Buffer.from("partial"));
      if (aborted) this.emit("aborted");
      this.destroy(new Error(aborted ? "request aborted" : "request stream failed"));
    },
  });
  return stream as unknown as IncomingMessage;
}

for (const aborted of [false, true]) {
  it(`ingest - limpa partial quando request ${aborted ? "é abortado" : "emite erro"}`, async () => {
    const f = await fixture();
    try {
      await expectCode(f.ingest.ingest(failingRequest(aborted), generationId), "invalid_package");
      expect(await readdir(path.join(f.storage.root, "tmp", "uploads"))).toEqual([]);
      expect(await f.storage.exists(f.storage.incomingPath(generationId))).toBe(false);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}
