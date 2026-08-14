import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../../../src/nest/core/app-config.js";
import { PlayerAnalyticsAuthService } from "../../../../src/nest/internal/player-analytics/player-analytics-auth.service.js";

function service(configured = true): PlayerAnalyticsAuthService {
  return new PlayerAnalyticsAuthService({
    playerAnalytics: {
      configured,
      storageRoot: "/tmp/test",
      ingestKey: "right-key",
      maxPackageBytes: 1,
      maxExtractedBytes: 1,
      maxEntries: 1,
    },
  } as AppConfig);
}

describe("PlayerAnalyticsAuthService", () => {
  it("rejeita chave ausente", () => {
    expect(() => service().authorize(undefined)).toThrowError("invalid_player_analytics_key");
  });

  it("rejeita chave errada", () => {
    expect(() => service().authorize("wrong-key")).toThrowError("invalid_player_analytics_key");
  });

  it("aceita chave válida", () => {
    expect(() => service().authorize("right-key")).not.toThrow();
  });

  it("responde indisponível quando a feature não está configurada", () => {
    expect(() => service(false).authorize("right-key")).toThrowError(
      "player_analytics_not_configured",
    );
  });
});
