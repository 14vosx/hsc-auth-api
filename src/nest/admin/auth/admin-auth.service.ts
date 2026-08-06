import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { parseCookieHeader } from "./parse-cookie-header.js";

export interface AdminIdentity {
  via: "session" | "admin-key";
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

  async resolveAdmin(
    cookieHeader?: string,
    adminKeyHeader?: string,
  ): Promise<AdminIdentity | null> {
    const sessionAdmin = await this.resolveSessionAdmin(cookieHeader);
    if (sessionAdmin) {
      return sessionAdmin;
    }

    const configuredKey = this.config.adminAuth.adminKey;
    if (configuredKey && adminKeyHeader === configuredKey) {
      return {
        via: "admin-key",
        userId: null,
        role: "admin",
        email: null,
        name: null,
        sessionId: null,
      };
    }

    return null;
  }
}
