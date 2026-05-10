// src/services/player-auth/steamAuth.js
import {
  PLAYER_STEAM_LOGIN_URL,
  PLAYER_STEAM_REALM,
  PLAYER_STEAM_RETURN_URL,
} from "../../config/playerSteamAuth.js";

const OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";

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
