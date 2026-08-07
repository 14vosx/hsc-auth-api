import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const PLAYER_STEAM_LOGIN_STATE_COOKIE =
  "hsc_player_steam_login_state";

const STATE_RE =
  /^[0-9a-f]{64}$/;

const STATE_MAX_AGE_SECONDS =
  10 * 60;

export function createPlayerSteamLoginState(): string {
  return randomBytes(32)
    .toString("hex");
}

export function isValidPlayerSteamLoginState(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    STATE_RE.test(value)
  );
}

export function securePlayerSteamLoginStateEqual(
  left: string,
  right: string,
): boolean {
  if (
    !isValidPlayerSteamLoginState(left) ||
    !isValidPlayerSteamLoginState(right)
  ) {
    return false;
  }

  const leftBuffer =
    Buffer.from(left, "utf8");

  const rightBuffer =
    Buffer.from(right, "utf8");

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

function appendCookieSecurity(
  parts: string[],
  publicUrl: string,
): string[] {
  parts.push(
    "SameSite=Lax",
  );

  if (
    publicUrl
      .startsWith("https://")
  ) {
    parts.push("Secure");
  }

  return parts;
}

export function buildPlayerSteamLoginStateCookie(
  state: string,
  publicUrl: string,
): string {
  if (
    !isValidPlayerSteamLoginState(
      state,
    )
  ) {
    throw new TypeError(
      "Invalid Steam login state.",
    );
  }

  const parts = [
    `${PLAYER_STEAM_LOGIN_STATE_COOKIE}=${state}`,
    "Path=/player/auth/steam",
    "HttpOnly",
    `Max-Age=${STATE_MAX_AGE_SECONDS}`,
  ];

  return appendCookieSecurity(
    parts,
    publicUrl,
  ).join("; ");
}

export function buildClearPlayerSteamLoginStateCookie(
  publicUrl: string,
): string {
  const parts = [
    `${PLAYER_STEAM_LOGIN_STATE_COOKIE}=`,
    "Path=/player/auth/steam",
    "HttpOnly",
    "Max-Age=0",
  ];

  return appendCookieSecurity(
    parts,
    publicUrl,
  ).join("; ");
}
