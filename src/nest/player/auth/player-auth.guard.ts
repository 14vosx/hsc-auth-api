import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { PlayerAuthService, PlayerIdentity } from "./player-auth.service.js";

interface RequestWithPlayer {
  headers: Record<string, string | string[] | undefined>;
  player?: PlayerIdentity;
}

@Injectable()
export class PlayerAuthGuard implements CanActivate {
  constructor(private readonly playerAuthService: PlayerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPlayer>();

    const rawCookie = request.headers["cookie"];
    const cookieHeader = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;

    const player = await this.playerAuthService.resolvePlayer(cookieHeader);

    if (!player) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.player = player;
    return true;
  }
}
