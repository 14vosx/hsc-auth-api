import { Controller, Get, Query, Res, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import { PlayerSteamOpenIdService } from "./player-steam-openid.service.js";
import { PlayerAccountRepository } from "./player-account.repository.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { buildPlayerSessionCookie } from "./build-player-session-cookie.js";

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  redirect(statusCode: number, url: string): void;
}

@Controller("player/auth/steam")
export class PlayerSteamAuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
    private readonly openIdService: PlayerSteamOpenIdService,
    private readonly accountRepository: PlayerAccountRepository,
    private readonly sessionRepository: PlayerSessionRepository,
  ) {}

  private shouldRedirect(): boolean {
    return this.config.playerSteamAuth.callbackRedirectEnabled === true;
  }

  private redirectFailure(response: HttpResponse): void {
    response.redirect(302, this.config.playerSteamAuth.failureRedirectUrl);
  }

  private redirectSuccess(response: HttpResponse): void {
    response.redirect(302, this.config.playerSteamAuth.successRedirectUrl);
  }

  @Get("start")
  async start(@Res() response: HttpResponse): Promise<void> {
    if (!this.databaseService.getStatus().ready) {
      response.status(503).json({ ok: false, error: "db_not_ready" });
      return;
    }

    if (!this.config.playerSteamAuth.enabled) {
      response.status(501).json(this.openIdService.buildUnavailablePayload());
      return;
    }

    response.redirect(302, this.openIdService.buildStartUrl());
  }

  @Get("callback")
  async callback(
    @Query() query: Record<string, unknown>,
    @Res() response: HttpResponse,
  ): Promise<void> {
    if (!this.databaseService.getStatus().ready) {
      response.status(503).json({ ok: false, error: "db_not_ready" });
      return;
    }

    if (!this.config.playerSteamAuth.enabled) {
      response.status(501).json(this.openIdService.buildUnavailablePayload());
      return;
    }

    const result = await this.openIdService.verifyCallback(query);

    if (!result.ok) {
      if (this.shouldRedirect()) {
        this.redirectFailure(response);
        return;
      }

      response
        .status(400)
        .json({ ok: false, error: result.error || "steam_openid_invalid" });
      return;
    }

    const accountResult =
      await this.accountRepository.resolveOrCreateFromSteamId(result.steamid64);

    if (!accountResult.ok) {
      if (this.shouldRedirect()) {
        this.redirectFailure(response);
        return;
      }

      response.status(500).json({
        ok: false,
        error: accountResult.error || "player_account_resolve_failed",
      });
      return;
    }

    if (accountResult.status === "disabled") {
      if (this.shouldRedirect()) {
        this.redirectFailure(response);
        return;
      }

      response.status(403).json({
        ok: false,
        error: "player_account_disabled",
        verified: true,
        steamid64: result.steamid64,
      });
      return;
    }

    let session;
    try {
      session = await this.sessionRepository.createPlayerSessionForAccount(
        accountResult.playerAccountId,
        this.config.playerAuth.ttlHours,
      );
    } catch {
      if (this.shouldRedirect()) {
        this.redirectFailure(response);
        return;
      }

      response
        .status(500)
        .json({ ok: false, error: "player_session_issue_failed" });
      return;
    }

    response.setHeader(
      "Set-Cookie",
      buildPlayerSessionCookie(
        session.rawToken,
        this.config.playerAuth,
        this.config.adminAuth.publicUrl,
      ),
    );

    if (this.shouldRedirect()) {
      this.redirectSuccess(response);
      return;
    }

    response.status(200).json({
      ok: true,
      authenticated: true,
      verified: true,
      steamid64: result.steamid64,
      player: {
        playerAccountId: accountResult.playerAccountId,
        steamid64: result.steamid64,
        displayName: accountResult.displayName ?? null,
      },
      session: {
        issued: true,
      },
      accountCreated: accountResult.accountCreated,
      identityCreated: accountResult.identityCreated,
    });
  }
}
