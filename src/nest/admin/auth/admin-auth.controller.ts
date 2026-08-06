import { Controller, Get, Headers, Res, HttpStatus } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service.js";

interface ResponseLike {
  status(code: number): ResponseLike;
}

@Controller("auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Get("session")
  async getSession(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const admin = await this.adminAuthService.resolveSessionAdmin(cookieHeader);

    if (!admin) {
      res.status(HttpStatus.UNAUTHORIZED);
      return {
        authenticated: false,
      };
    }

    res.status(HttpStatus.OK);
    return {
      authenticated: true,
      user: {
        id: String(admin.userId),
        email: admin.email,
        name: admin.name,
      },
      role: admin.role,
    };
  }
}
