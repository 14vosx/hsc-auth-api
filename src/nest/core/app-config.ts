export interface AppConfig {
  readonly runtime: {
    readonly port: number;
    readonly publicUrl: string;
  };
  readonly cors: {
    readonly allowedOrigin: string;
    readonly allowedOrigins: readonly string[];
  };
  readonly db: {
    readonly configured: boolean;
    readonly connection: {
      readonly host: string;
      readonly port: number;
      readonly user?: string;
      readonly password?: string;
      readonly database?: string;
      readonly timezone: string;
      readonly ssl?: {
        readonly rejectUnauthorized: boolean;
      };
    };
  };
  readonly adminAuth: {
    readonly adminKey: string;
    readonly cookieName: string;
    readonly ttlHours: number;
    readonly devBootstrapEnabled: boolean;
    readonly devAdminEmail: string;
    readonly devAdminName: string;
    readonly magicLinkTtlMinutes: number;
    readonly publicUrl: string;
    readonly backofficeUrl: string;
    readonly magicLinkCallbackPath: string;
    readonly magicLinkFromEmail: string;
    readonly magicLinkSubject: string;
    readonly smtpHost: string;
    readonly smtpPort: number;
    readonly smtpSecure: boolean;
    readonly smtpUser: string;
    readonly smtpPass: string;
  };
  readonly playerAuth?: unknown;
  readonly playerSteamAuth?: unknown;
  readonly playerBunker?: unknown;
}

export const APP_CONFIG = Symbol("APP_CONFIG");
