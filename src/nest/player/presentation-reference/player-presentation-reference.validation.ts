const STEAM_ID_64 = /^[0-9]{17}$/;
export const PLAYER_PRESENTATION_REFERENCE_BATCH_LIMIT = 100;

export type PlayerPresentationReferenceValidationResult =
  | { ok: true; steamIds: string[] }
  | { ok: false; error: "invalid_body" | "invalid_steam_id" | "batch_limit_exceeded" };

export function validatePresentationReferenceResolveBody(
  body: unknown,
): PlayerPresentationReferenceValidationResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Array.isArray(input.steamIds) || input.steamIds.length === 0) {
    return { ok: false, error: "invalid_body" };
  }
  if (input.steamIds.length > PLAYER_PRESENTATION_REFERENCE_BATCH_LIMIT) {
    return { ok: false, error: "batch_limit_exceeded" };
  }
  if (input.steamIds.some((value) => typeof value !== "string" || !STEAM_ID_64.test(value))) {
    return { ok: false, error: "invalid_steam_id" };
  }
  return { ok: true, steamIds: [...new Set(input.steamIds as string[])] };
}
