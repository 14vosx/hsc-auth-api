import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { AdminAuthService, AdminIdentity } from "./admin-auth.service.js";

interface RequestWithAdmin {
  headers: Record<string, string | string[] | undefined>;
  admin?: AdminIdentity;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();

    const rawCookie = request.headers["cookie"];
    const cookieHeader = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;

    const rawAdminKey = request.headers["x-admin-key"];
    const adminKeyHeader = Array.isArray(rawAdminKey)
      ? rawAdminKey[0]
      : rawAdminKey;

    const admin = await this.adminAuthService.resolveAdmin(
      cookieHeader,
      adminKeyHeader,
    );

    if (!admin) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.admin = admin;
    return true;
  }
}
