import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { parseCookieHeader } from "./parse-cookie-header.js";

export interface AdminIdentity {
  via: "session";
  userId: number | null;
  role: string | null;
  email: string | null;
  name: string | null;
  sessionId: string | null;
}

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repository: AdminSessionRepository,
  ) {}

  async resolveSessionAdmin(
    cookieHeader?: string,
  ): Promise<AdminIdentity | null> {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[this.config.adminAuth.cookieName];

    if (!token) {
      return null;
    }

    const session = await this.repository.findActiveSessionByToken(token);
    if (!session) {
      return null;
    }

    if (session.role !== "admin") {
      return null;
    }

    return {
      via: "session",
      userId: Number.isInteger(session.userId) ? session.userId : null,
      role: session.role ?? null,
      email: session.email ?? null,
      name: session.name ?? null,
      sessionId: session.sessionId ?? null,
    };
  }
}
