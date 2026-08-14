import { expect, it } from "vitest";
import { link, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../../../src/nest/core/app-config.js";
import { resolveWithinStorageRoot, PlayerAnalyticsStorageService } from "../../../../src/nest/internal/player-analytics/player-analytics-storage.service.js";
import { PlayerAnalyticsStatusService } from "../../../../src/nest/internal/player-analytics/player-analytics-status.service.js";

const generationId = "20260814T044747694837Z-0d00de77";

async function withStorage(run: (root: string, service: PlayerAnalyticsStatusService) => Promise<void>) {
  const root = await (await import("node:fs/promises")).mkdtemp("/tmp/hsc-player-analytics-status-");
  const storage = new PlayerAnalyticsStorageService({ playerAnalytics: {
    configured: true, storageRoot: root, ingestKey: "key", maxPackageBytes: 100, maxExtractedBytes: 100, maxEntries: 10,
  } } as AppConfig);
  try { await run(root, new PlayerAnalyticsStatusService(storage)); }
  finally { await storage.remove(root); }
}

for (const state of ["incoming", "accepted", "rejected"] as const) {
  it(`status - ${state}`, async () => withStorage(async (root, service) => {
    await mkdir(path.join(root, state, generationId), { recursive: true });
    expect((await service.get(generationId)).state).toBe(state);
  }));
}

it("status - not_found", async () => withStorage(async (_root, service) => {
  expect((await service.get(generationId)).state).toBe("not_found");
}));

it("status - consulta em root vazio é read-only", async () => withStorage(async (root, service) => {
  expect((await service.get(generationId)).state).toBe("not_found");
  expect(await readdir(root)).toEqual([]);
}));

it("storage - containment rejeita escape relativo e absoluto", () => {
  expect(() => resolveWithinStorageRoot("/tmp/storage", "..", "escape")).toThrow();
  expect(() => resolveWithinStorageRoot("/tmp/storage", "/outside")).toThrow();
  expect(resolveWithinStorageRoot("/tmp/storage", "incoming", generationId)).toBe(
    path.join("/tmp/storage", "incoming", generationId),
  );
});

it("status - current ganha prioridade", async () => withStorage(async (root, service) => {
  await mkdir(path.join(root, "accepted", generationId), { recursive: true });
  await mkdir(path.join(root, "incoming", generationId), { recursive: true });
  await writeFile(path.join(root, "current"), `${generationId}\n`);
  expect((await service.get(generationId)).state).toBe("current");
}));

it("status - current aceita marcador sem newline final", async () => withStorage(async (root, service) => {
  await writeFile(path.join(root, "current"), generationId);
  expect((await service.get(generationId)).state).toBe("current");
}));

it("status - current não segue symlink", async () => withStorage(async (root, service) => {
  const marker = path.join(root, "marker");
  await writeFile(marker, generationId);
  await symlink(marker, path.join(root, "current"));
  expect((await service.get(generationId)).state).toBe("not_found");
}));

it("status - current rejeita directory", async () => withStorage(async (root, service) => {
  await mkdir(path.join(root, "current"));
  expect((await service.get(generationId)).state).toBe("not_found");
}));

it("status - current rejeita hardlink", async () => withStorage(async (root, service) => {
  const marker = path.join(root, "marker");
  await writeFile(marker, generationId);
  await link(marker, path.join(root, "current"));
  expect((await service.get(generationId)).state).toBe("not_found");
}));

it("status - current exige conteúdo canônico exato", async () => withStorage(async (root, service) => {
  await writeFile(path.join(root, "current"), ` ${generationId} \n`);
  expect((await service.get(generationId)).state).toBe("not_found");
}));
