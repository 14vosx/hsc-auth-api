import { describe, expect, it } from "vitest";
import { isValidGenerationId } from "../../../../src/nest/internal/player-analytics/player-analytics-contract.js";

describe("generation id contract", () => {
  it("aceita formato canônico real", () => {
    expect(isValidGenerationId("20260814T044747694837Z-0d00de77")).toBe(true);
  });

  it("rejeita timestamp impossível", () => {
    expect(isValidGenerationId("20260230T044747694837Z-0d00de77")).toBe(false);
    expect(isValidGenerationId("20260814T256161694837Z-0d00de77")).toBe(false);
  });

  it("rejeita suffix uppercase, traversal e string arbitrária", () => {
    expect(isValidGenerationId("20260814T044747694837Z-0D00DE77")).toBe(false);
    expect(isValidGenerationId("../20260814T044747694837Z-0d00de77")).toBe(false);
    expect(isValidGenerationId("generation-latest")).toBe(false);
  });
});
