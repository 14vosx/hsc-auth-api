import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PlayerAnalyticsGenerationInvalidError } from "../../../../src/nest/internal/player-analytics/player-analytics-generation-invalid.error.js";
import { PlayerAnalyticsGenerationValidatorService } from "../../../../src/nest/internal/player-analytics/player-analytics-generation-validator.service.js";
import { addCompetitivePlayer, buildGeneration, GENERATED_AT, GENERATION_ID, rewriteChecksums, STEAM_ID } from "./player-analytics-generation.fixture.js";

async function fixture(withSeason = false) {
  const parent = await mkdtemp("/tmp/hsc-player-analytics-validator-");
  const root = path.join(parent, GENERATION_ID);
  await mkdir(root);
  await buildGeneration(root, withSeason);
  return { parent, root, validator: new PlayerAnalyticsGenerationValidatorService() };
}

it("validator - competitive-only e Season zero-player canônicos são válidos", async () => {
  for (const withSeason of [false, true]) {
    const f = await fixture(withSeason);
    try {
      await expect(f.validator.validate(f.root, GENERATION_ID)).resolves.toMatchObject({ generationId: GENERATION_ID, generatedAt: GENERATED_AT });
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  }
});

it("validator - aceita métricas arbitrárias contract-valid sem recalcular fórmulas", async () => {
  const f = await fixture();
  try {
    await addCompetitivePlayer(f.root);
    await expect(f.validator.validate(f.root, GENERATION_ID)).resolves.toBeDefined();
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

it.each([
  ["contractVersion", "bad"],
  ["generationId", "20260814T044747694837Z-aaaaaaaa"],
  ["generatedAt", "2026-08-14T04:47:48Z"],
  ["products", ["season"]],
] as const)("validator - rejeita manifest semanticamente inválido: %s", async (field, value) => {
  const f = await fixture();
  try {
    const target = path.join(f.root, "generation-manifest.json");
    const manifest = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    manifest[field] = value;
    await writeFile(target, `${JSON.stringify(manifest)}\n`);
    await rewriteChecksums(f.root);
    await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

it("validator - checksum mismatch, entrada ausente/extra e path inseguro", async () => {
  for (const mutation of ["mismatch", "missing", "extra", "unsafe"] as const) {
    const f = await fixture();
    try {
      const checksum = path.join(f.root, "checksums.sha256");
      const lines = (await readFile(checksum, "utf8")).trimEnd().split("\n");
      if (mutation === "mismatch") lines[0] = `${"0".repeat(64)}${lines[0].slice(64)}`;
      if (mutation === "missing") lines.pop();
      if (mutation === "extra") lines.push(`${"0".repeat(64)}  extra.json`);
      if (mutation === "unsafe") lines[0] = `${lines[0].slice(0, 66)}../escape.json`;
      await writeFile(checksum, `${lines.join("\n")}\n`);
      await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  }
});

it("validator - corrupção semântica permanece inválida com checksums recalculados", async () => {
  const f = await fixture();
  try {
    await addCompetitivePlayer(f.root);
    const target = path.join(f.root, "competitive", "player", `${STEAM_ID}.json`);
    const payload = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    payload.periods = { "7d": {}, "30d": {} };
    await writeFile(target, `${JSON.stringify(payload)}\n`);
    await rewriteChecksums(f.root);
    await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

it("validator - árvore extra, arquivo faltante e symlink são deterministic-invalid", async () => {
  for (const mutation of ["extra", "missing", "symlink"] as const) {
    const f = await fixture();
    try {
      if (mutation === "extra") await writeFile(path.join(f.root, "extra.json"), "{}\n");
      if (mutation === "missing") await unlink(path.join(f.root, "competitive", "players-manifest.json"));
      if (mutation === "symlink") await symlink(path.join(f.root, "generation-manifest.json"), path.join(f.root, "link"));
      await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  }
});

it.each(["malformed", "duplicate-slug", "invalid-scope"] as const)(
  "validator - rejeita snapshot %s",
  async (mutation) => {
    const f = await fixture(true);
    try {
      const target = path.join(f.root, "seasons-snapshot.json");
      const snapshot = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
      if (mutation === "malformed") delete snapshot.contractVersion;
      if (mutation === "duplicate-slug") snapshot.seasons = [
        ...(snapshot.seasons as unknown[]),
        ...(snapshot.seasons as unknown[]),
      ];
      if (mutation === "invalid-scope") {
        const seasons = snapshot.seasons as Array<{ scope: { startAt: string } }>;
        seasons[0].scope.startAt = "2027-01-01T00:00:00Z";
      }
      await writeFile(target, `${JSON.stringify(snapshot)}\n`);
      await rewriteChecksums(f.root);
      await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  },
);

it.each(["bad-steamid", "identity", "periods", "byMap", "recentMaps", "timeline"] as const)(
  "validator - rejeita contrato profundo inválido: %s",
  async (mutation) => {
    const f = await fixture();
    try {
      await addCompetitivePlayer(f.root);
      if (mutation === "bad-steamid") {
        const target = path.join(f.root, "competitive", "players-discovery.json");
        const value = JSON.parse(await readFile(target, "utf8")) as { players: Array<{ steamid64: string }> };
        value.players[0].steamid64 = "invalid";
        await writeFile(target, `${JSON.stringify(value)}\n`);
      } else {
        const target = path.join(f.root, "competitive", "player", `${STEAM_ID}.json`);
        const value = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
        if (mutation === "identity") value.steamid64 = "76561198000000002";
        else if (mutation === "periods") value.periods = { "7d": {}, "30d": {} };
        else value[mutation] = "malformed";
        await writeFile(target, `${JSON.stringify(value)}\n`);
      }
      await rewriteChecksums(f.root);
      await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  },
);

it.each(["unexpected", "missing"] as const)("validator - rejeita Season subtree %s", async (mutation) => {
  const f = await fixture(mutation === "missing");
  try {
    if (mutation === "unexpected") await mkdir(path.join(f.root, "season"));
    else await rm(path.join(f.root, "season"), { recursive: true });
    await expect(f.validator.validate(f.root, GENERATION_ID)).rejects.toBeInstanceOf(PlayerAnalyticsGenerationInvalidError);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});
