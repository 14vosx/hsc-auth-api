export interface AppConfig {
  readonly runtime: {
    readonly port: number;
    readonly publicUrl: string;
  };
  readonly adminAuth?: unknown;
  readonly playerAuth?: unknown;
  readonly playerSteamAuth?: unknown;
  readonly playerBunker?: unknown;
}

export const APP_CONFIG = Symbol("APP_CONFIG");
