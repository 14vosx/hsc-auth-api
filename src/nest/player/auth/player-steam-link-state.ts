import { timingSafeEqual } from "node:crypto";

export const PLAYER_STEAM_LINK_STATE_COOKIE =
  "hsc_player_steam_link_state";

const STATE_RE = /^[0-9a-f]{64}$/;

export function isValidPlayerSteamLinkState(
  value: unknown,
): value is string {
  return typeof value === "string" && STATE_RE.test(value);
}

export function securePlayerSteamLinkStateEqual(
  left: string,
  right: string,
): boolean {
  if (
    !isValidPlayerSteamLinkState(left) ||
    !isValidPlayerSteamLinkState(right)
  ) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function appendCookieSecurity(
  parts: string[],
  publicUrl: string,
): string[] {
  parts.push("SameSite=Lax");

  if (new URL(publicUrl).protocol === "https:") {
    parts.push("Secure");
  }

  return parts;
}

export function buildPlayerSteamLinkStateCookie(
  state: string,
  publicUrl: string,
  ttlMinutes: number,
): string {
  if (!isValidPlayerSteamLinkState(state)) {
    throw new TypeError("Invalid Steam link state.");
  }

  const parts = [
    `${PLAYER_STEAM_LINK_STATE_COOKIE}=${state}`,
    "Path=/player/auth/steam/link",
    "HttpOnly",
    `Max-Age=${ttlMinutes * 60}`,
  ];

  return appendCookieSecurity(parts, publicUrl).join("; ");
}

export function buildClearPlayerSteamLinkStateCookie(
  publicUrl: string,
): string {
  const parts = [
    `${PLAYER_STEAM_LINK_STATE_COOKIE}=`,
    "Path=/player/auth/steam/link",
    "HttpOnly",
    "Max-Age=0",
  ];

  return appendCookieSecurity(parts, publicUrl).join("; ");
}
