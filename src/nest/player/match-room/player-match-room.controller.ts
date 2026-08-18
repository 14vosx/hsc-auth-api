import {
  Body, Controller, Get, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards,
} from "@nestjs/common";
import { Throttle, minutes } from "@nestjs/throttler";

import type { MatchRoomSnapshot } from "../../match/match-room.contract.js";
import { MatchRoomError, type MatchRoomErrorCode } from "../../match/match-room.error.js";
import { MatchRoomService } from "../../match/match-room.service.js";
import { PlayerAuthGuard } from "../auth/player-auth.guard.js";
import type { PlayerIdentity } from "../auth/player-auth.service.js";
import { PlayerAccountThrottlerGuard } from "../security/player-account-throttler.guard.js";
import { PlayerCsrfGuard } from "../security/player-csrf.guard.js";

interface PlayerMatchRoomRequest { player?: PlayerIdentity }
interface MatchRoomServicePort {
  list(viewerId: string): Promise<MatchRoomSnapshot[]>;
  current(viewerId: string): Promise<MatchRoomSnapshot | null>;
  get(roomId: string, viewerId: string): Promise<MatchRoomSnapshot>;
  create(viewerId: string): Promise<MatchRoomSnapshot>;
  join(roomId: string, viewerId: string): Promise<MatchRoomSnapshot>;
  leave(roomId: string, viewerId: string): Promise<MatchRoomSnapshot>;
  cancel(roomId: string, viewerId: string): Promise<MatchRoomSnapshot>;
  confirm(roomId: string, viewerId: string): Promise<MatchRoomSnapshot>;
  draftPick(roomId: string, viewerId: string, targetPlayerAccountId: string): Promise<MatchRoomSnapshot>;
}

function viewerId(request: PlayerMatchRoomRequest): string {
  const id = request.player?.playerAccountId;
  if (!id) throw new HttpException({ ok: false, error: "invalid_session" }, HttpStatus.UNAUTHORIZED);
  return id;
}

function validateDraftPickBody(body: unknown): { ok: true; targetPlayerAccountId: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || !("playerAccountId" in body)) {
    return { ok: false, error: "invalid_body" };
  }
  const targetId = (body as Record<string, unknown>).playerAccountId;
  if (typeof targetId !== "string" || targetId.trim() === "") {
    return { ok: false, error: "invalid_body" };
  }
  return { ok: true, targetPlayerAccountId: targetId.trim() };
}

const FORBIDDEN_ERRORS = new Set<MatchRoomErrorCode>([
  "steam_identity_not_linked", "player_account_disabled", "membership_required",
  "membership_inactive", "membership_suspended", "membership_expired",
  "membership_cancelled", "not_room_participant", "creator_must_cancel_room", "not_room_creator",
  "not_draft_picker",
]);

function mapError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (!(error instanceof MatchRoomError)) {
    console.error("[player-match-room] operation failed");
    throw new HttpException({ ok: false, error: "match_room_operation_failed" }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  const status = error.code === "room_not_found"
    ? HttpStatus.NOT_FOUND
    : FORBIDDEN_ERRORS.has(error.code)
      ? HttpStatus.FORBIDDEN
      : HttpStatus.CONFLICT;
  throw new HttpException({ ok: false, error: error.code }, status);
}

@Controller("player/match-rooms")
@UseGuards(PlayerAuthGuard)
export class PlayerMatchRoomController {
  constructor(@Inject(MatchRoomService) private readonly service: MatchRoomServicePort) {}

  @Get()
  async list(@Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRooms: await this.service.list(viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Get("current")
  async current(@Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.current(viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Get(":roomId")
  async get(@Param("roomId") roomId: string, @Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.get(roomId, viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post()
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async create(@Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.create(viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post(":roomId/join")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async join(@Param("roomId") roomId: string, @Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.join(roomId, viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post(":roomId/leave")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async leave(@Param("roomId") roomId: string, @Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.leave(roomId, viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post(":roomId/cancel")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async cancel(@Param("roomId") roomId: string, @Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.cancel(roomId, viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post(":roomId/confirm")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async confirm(@Param("roomId") roomId: string, @Req() request: PlayerMatchRoomRequest) {
    try { return { ok: true, matchRoom: await this.service.confirm(roomId, viewerId(request)) }; }
    catch (error) { return mapError(error); }
  }

  @Post(":roomId/draft/pick")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async draftPick(
    @Param("roomId") roomId: string,
    @Body() body: unknown,
    @Req() request: PlayerMatchRoomRequest,
  ) {
    const validation = validateDraftPickBody(body);
    if (!validation.ok) {
      throw new HttpException({ ok: false, error: validation.error }, HttpStatus.BAD_REQUEST);
    }
    try {
      return { ok: true, matchRoom: await this.service.draftPick(roomId, viewerId(request), validation.targetPlayerAccountId) };
    } catch (error) { return mapError(error); }
  }
}
