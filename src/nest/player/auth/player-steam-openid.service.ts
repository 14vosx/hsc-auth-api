import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";

const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";
const STEAM_OPENID_CLAIMED_ID_RE =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export interface SteamOpenIdSuccess {
  ok: true;
  steamid64: string;
  claimedId: string;
}

export interface SteamOpenIdFailure {
  ok: false;
  error: string;
}

export type SteamOpenIdResult =
  | SteamOpenIdSuccess
  | SteamOpenIdFailure;

@Injectable()
export class PlayerSteamOpenIdService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  buildUnavailablePayload(): SteamOpenIdFailure {
    return {
      ok: false,
      error: "steam_auth_not_implemented",
    };
  }

  buildStartUrl(): string {
    const authConfig = this.config.playerSteamAuth;
    const url = new URL(authConfig.loginUrl);

    url.searchParams.set("openid.ns", OPENID_NS);
    url.searchParams.set("openid.mode", "checkid_setup");
    url.searchParams.set("openid.return_to", authConfig.returnUrl);
    url.searchParams.set("openid.realm", authConfig.realm);
    url.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
    url.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);

    return url.toString();
  }

  private firstQueryValue(value: unknown): string | null {
    if (Array.isArray(value)) {
      const first = value[0];
      return first !== null && first !== undefined ? String(first) : null;
    }
    return value !== null && value !== undefined ? String(value) : null;
  }

  private readStringQueryValue(
    query: Record<string, unknown>,
    key: string,
  ): string | null {
    return this.firstQueryValue(query[key]);
  }

  private extractSteamId64FromClaimedId(claimedId: string | null): string | null {
    const value = String(claimedId ?? "").trim();
    const match = STEAM_OPENID_CLAIMED_ID_RE.exec(value);
    return match ? match[1] : null;
  }

  private buildVerificationBody(
    query: Record<string, unknown>,
  ): URLSearchParams {
    const body = new URLSearchParams();

    for (const [key, rawValue] of Object.entries(query ?? {})) {
      if (!key.startsWith("openid.")) {
        continue;
      }

      const value = this.firstQueryValue(rawValue);
      if (value === null || value === undefined) {
        continue;
      }

      body.set(key, String(value));
    }

    body.set("openid.mode", "check_authentication");
    return body;
  }

  private hasValidSteamOpenIdResponse(text: string): boolean {
    return String(text ?? "")
      .split(/\r?\n/)
      .some((line) => line.trim() === "is_valid:true");
  }

  async verifyCallback(
    query: Record<string, unknown>,
  ): Promise<SteamOpenIdResult> {
    const authConfig = this.config.playerSteamAuth;

    const mode = this.readStringQueryValue(query, "openid.mode");
    const ns = this.readStringQueryValue(query, "openid.ns");
    const opEndpoint = this.readStringQueryValue(query, "openid.op_endpoint");
    const returnTo = this.readStringQueryValue(query, "openid.return_to");
    const claimedId = this.readStringQueryValue(query, "openid.claimed_id");
    const identity = this.readStringQueryValue(query, "openid.identity");
    const signed = this.readStringQueryValue(query, "openid.signed");
    const sig = this.readStringQueryValue(query, "openid.sig");

    if (mode !== "id_res") {
      return { ok: false, error: "steam_openid_invalid_mode" };
    }

    if (ns !== OPENID_NS) {
      return { ok: false, error: "steam_openid_invalid_ns" };
    }

    if (opEndpoint !== authConfig.loginUrl) {
      return { ok: false, error: "steam_openid_invalid_op_endpoint" };
    }

    if (returnTo !== authConfig.returnUrl) {
      return { ok: false, error: "steam_openid_return_to_mismatch" };
    }

    const steamid64 = this.extractSteamId64FromClaimedId(claimedId);
    if (!steamid64) {
      return { ok: false, error: "steam_openid_invalid_claimed_id" };
    }

    if (identity !== claimedId) {
      return { ok: false, error: "steam_openid_identity_mismatch" };
    }

    if (!signed || !sig) {
      return { ok: false, error: "steam_openid_missing_signature" };
    }

    const body = this.buildVerificationBody(query);
    let response: Response;

    try {
      response = await fetch(authConfig.loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
    } catch {
      return { ok: false, error: "steam_openid_verification_failed" };
    }

    if (!response.ok) {
      return { ok: false, error: "steam_openid_verification_http_failed" };
    }

    const text = await response.text();
    if (!this.hasValidSteamOpenIdResponse(text)) {
      return { ok: false, error: "steam_openid_invalid" };
    }

    return {
      ok: true,
      steamid64,
      claimedId: claimedId!,
    };
  }
}
