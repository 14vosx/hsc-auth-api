import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import {
  AdminDevBootstrapRepository,
  LocalAdminUser,
} from "./admin-dev-bootstrap.repository.js";
import { AdminSessionRepository } from "./admin-session.repository.js";

export interface DevBootstrapResult {
  user: LocalAdminUser;
  rawToken: string;
}

@Injectable()
export class AdminDevBootstrapService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly bootstrapRepository: AdminDevBootstrapRepository,
    private readonly sessionRepository: AdminSessionRepository,
  ) {}

  async bootstrapSession(): Promise<DevBootstrapResult> {
    const authConfig = this.config.adminAuth;

    const user = await this.bootstrapRepository.ensureLocalAdminUser({
      email: authConfig.devAdminEmail,
      name: authConfig.devAdminName,
    });

    const session = await this.sessionRepository.createSessionForUser(
      user.id,
      authConfig.ttlHours,
    );

    return {
      user,
      rawToken: session.rawToken,
    };
  }
}
