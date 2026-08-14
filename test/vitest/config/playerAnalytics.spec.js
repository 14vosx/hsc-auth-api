import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAppConfig } from "../../../src/config/appConfig.js";
import { buildPlayerAnalyticsConfig } from "../../../src/config/playerAnalytics.js";

describe("player analytics config", () => {
  it("fica unconfigured por default", () => {
    const config = buildAppConfig({}).playerAnalytics;
    expect(config).toMatchObject({
      configured: false,
      storageRoot: "",
      ingestKey: "",
      maxPackageBytes: 33_554_432,
      maxExtractedBytes: 134_217_728,
      maxEntries: 10_000,
      reconciliationIntervalMs: 30_000,
    });
  });

  it("aceita configuração completa e limites", () => {
    const config = buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_STORAGE_ROOT: "./var/player-analytics",
      PLAYER_ANALYTICS_INGEST_KEY: "dedicated-key",
      PLAYER_ANALYTICS_MAX_PACKAGE_BYTES: "100",
      PLAYER_ANALYTICS_MAX_EXTRACTED_BYTES: "200",
      PLAYER_ANALYTICS_MAX_ENTRIES: "3",
    });
    expect(config).toEqual({
      configured: true,
      storageRoot: path.resolve("./var/player-analytics"),
      ingestKey: "dedicated-key",
      maxPackageBytes: 100,
      maxExtractedBytes: 200,
      maxEntries: 3,
      reconciliationIntervalMs: 30_000,
    });
  });

  it.each([
    [undefined, 30_000],
    ["5000", 5_000],
    ["300000", 300_000],
  ])("reconciliation interval %s", (value, expected) => {
    expect(buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_RECONCILIATION_INTERVAL_MS: value,
    }).reconciliationIntervalMs).toBe(expected);
  });

  it.each(["4999", "300001", "invalid"])("rejeita reconciliation interval inválido %s", (value) => {
    expect(() => buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_RECONCILIATION_INTERVAL_MS: value,
    })).toThrow("PLAYER_ANALYTICS_RECONCILIATION_INTERVAL_MS");
  });

  it("não quebra AppConfig com configuração parcial", () => {
    const config = buildAppConfig({ PLAYER_ANALYTICS_STORAGE_ROOT: "./candidate" });
    expect(config.playerAnalytics.configured).toBe(false);
    expect(config.runtime.port).toBe(3000);
  });

  it("usa defaults seguros para limites inválidos", () => {
    const config = buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_MAX_PACKAGE_BYTES: "0",
      PLAYER_ANALYTICS_MAX_EXTRACTED_BYTES: "not-a-number",
      PLAYER_ANALYTICS_MAX_ENTRIES: "-1",
    });
    expect(config.maxPackageBytes).toBe(33_554_432);
    expect(config.maxExtractedBytes).toBe(134_217_728);
    expect(config.maxEntries).toBe(10_000);
  });

  it("aceita os ceilings absolutos", () => {
    const config = buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_MAX_PACKAGE_BYTES: "67108864",
      PLAYER_ANALYTICS_MAX_EXTRACTED_BYTES: "268435456",
      PLAYER_ANALYTICS_MAX_ENTRIES: "20000",
    });
    expect(config.maxPackageBytes).toBe(67_108_864);
    expect(config.maxExtractedBytes).toBe(268_435_456);
    expect(config.maxEntries).toBe(20_000);
  });

  it("usa defaults para valores acima dos ceilings", () => {
    const config = buildPlayerAnalyticsConfig({
      PLAYER_ANALYTICS_MAX_PACKAGE_BYTES: "67108865",
      PLAYER_ANALYTICS_MAX_EXTRACTED_BYTES: "268435457",
      PLAYER_ANALYTICS_MAX_ENTRIES: "20001",
    });
    expect(config.maxPackageBytes).toBe(33_554_432);
    expect(config.maxExtractedBytes).toBe(134_217_728);
    expect(config.maxEntries).toBe(10_000);
  });
});
