export interface AppConfig {
  readonly runtime: {
    readonly port: number;
    readonly publicUrl: string;
  };
  readonly mailTransport: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly user: string;
    readonly pass: string;
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
  };
  readonly playerAuth: {
    readonly cookieName: string;
    readonly ttlHours: number;
  };
  readonly playerEmailAuth: {
    readonly enabled: boolean;
    readonly verificationTtlMinutes: number;
    readonly verificationUrl: string;
    readonly fromEmail: string;
    readonly verificationSubject: string;
    readonly passwordResetTtlMinutes: number;
    readonly passwordResetUrl: string;
    readonly passwordResetSubject: string;
  };
  readonly playerSteamAuth: {
    readonly enabled: boolean;
    readonly returnUrl: string;
    readonly realm: string;
    readonly loginUrl: string;
    readonly successRedirectUrl: string;
    readonly failureRedirectUrl: string;
    readonly callbackRedirectEnabled: boolean;
  };
  readonly playerBunker: {
    readonly artifactRoot: string;
    readonly activeSeasonSlug: string;
    readonly staticApiBaseUrl: string;
    readonly staticApiTimeoutMs: number;
  };
  readonly steamProfiles: {
    readonly internalApiKey: string;
    readonly steamApiKey: string;
    readonly cacheTtlSeconds: number;
    readonly timeoutSeconds: number;
  };
  readonly uploads: {
    readonly uploadDir: string;
    readonly publicPath: string;
    readonly publicBaseUrl: string;
    readonly maxBytes: number;
  };
}

export const APP_CONFIG = Symbol("APP_CONFIG");
