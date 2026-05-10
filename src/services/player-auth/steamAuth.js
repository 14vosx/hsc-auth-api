// src/services/player-auth/steamAuth.js
import {
  PLAYER_STEAM_LOGIN_URL,
  PLAYER_STEAM_REALM,
  PLAYER_STEAM_RETURN_URL,
} from "../../config/playerSteamAuth.js";

const OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";

export const STEAM_OPENID_CLAIMED_ID_RE =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readStringQueryValue(query, key) {
  const value = firstQueryValue(query?.[key]);

  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

export function buildSteamAuthUnavailablePayload() {
  return { ok: false, error: "steam_auth_not_implemented" };
}

export function buildSteamOpenIdStartUrl() {
  const url = new URL(PLAYER_STEAM_LOGIN_URL);

  url.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", PLAYER_STEAM_RETURN_URL);
  url.searchParams.set("openid.realm", PLAYER_STEAM_REALM);
  url.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
  url.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);

  return url.toString();
}

export function readSteamCallbackQuery(query) {
  return {
    ns: readStringQueryValue(query, "openid.ns"),
    mode: readStringQueryValue(query, "openid.mode"),
    opEndpoint: readStringQueryValue(query, "openid.op_endpoint"),
    claimedId: readStringQueryValue(query, "openid.claimed_id"),
    identity: readStringQueryValue(query, "openid.identity"),
    returnTo: readStringQueryValue(query, "openid.return_to"),
    responseNonce: readStringQueryValue(query, "openid.response_nonce"),
    assocHandle: readStringQueryValue(query, "openid.assoc_handle"),
    signed: readStringQueryValue(query, "openid.signed"),
    sig: readStringQueryValue(query, "openid.sig"),
  };
}

export function extractSteamId64FromClaimedId(claimedId) {
  const value = String(claimedId ?? "").trim();
  const match = STEAM_OPENID_CLAIMED_ID_RE.exec(value);

  return match ? match[1] : null;
}

export function buildSteamOpenIdVerificationBody(query) {
  const body = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query ?? {})) {
    if (!key.startsWith("openid.")) {
      continue;
    }

    const value = firstQueryValue(rawValue);
    if (value === null || value === undefined) {
      continue;
    }

    body.set(key, String(value));
  }

  body.set("openid.mode", "check_authentication");

  return body;
}

function hasValidSteamOpenIdResponse(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .some((line) => line.trim() === "is_valid:true");
}

export async function verifySteamOpenIdCallback(query, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const expectedReturnUrl =
    options.expectedReturnUrl ?? PLAYER_STEAM_RETURN_URL;
  const steamLoginUrl = options.steamLoginUrl ?? PLAYER_STEAM_LOGIN_URL;
  const callback = readSteamCallbackQuery(query);

  if (callback.mode !== "id_res") {
    return { ok: false, error: "steam_openid_invalid_mode" };
  }

  if (callback.ns !== "http://specs.openid.net/auth/2.0") {
    return { ok: false, error: "steam_openid_invalid_ns" };
  }

  if (callback.opEndpoint !== steamLoginUrl) {
    return { ok: false, error: "steam_openid_invalid_op_endpoint" };
  }

  if (callback.returnTo !== expectedReturnUrl) {
    return { ok: false, error: "steam_openid_return_to_mismatch" };
  }

  const steamid64 = extractSteamId64FromClaimedId(callback.claimedId);
  if (!steamid64) {
    return { ok: false, error: "steam_openid_invalid_claimed_id" };
  }

  if (callback.identity !== callback.claimedId) {
    return { ok: false, error: "steam_openid_identity_mismatch" };
  }

  if (!callback.signed || !callback.sig) {
    return { ok: false, error: "steam_openid_missing_signature" };
  }

  const body = buildSteamOpenIdVerificationBody(query);
  let response;

  try {
    response = await fetchImpl(steamLoginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    return { ok: false, error: "steam_openid_verification_failed" };
  }

  if (!response?.ok) {
    return { ok: false, error: "steam_openid_verification_http_failed" };
  }

  const text = await response.text();
  if (!hasValidSteamOpenIdResponse(text)) {
    return { ok: false, error: "steam_openid_invalid" };
  }

  return {
    ok: true,
    steamid64,
    claimedId: callback.claimedId,
  };
}
