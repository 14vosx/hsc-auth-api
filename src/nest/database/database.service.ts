import { Injectable, Inject, OnModuleInit, OnApplicationShutdown } from "@nestjs/common";
import mysql from "mysql2/promise";
import { AppConfig, APP_CONFIG } from "../core/app-config.js";

export interface DatabaseStatus {
  ready: boolean;
  error: string | null;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private pool: mysql.Pool | null = null;
  private status: DatabaseStatus = { ready: false, error: null };

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.db.configured) {
      this.status = { ready: false, error: null };
      return;
    }

    try {
      this.pool = mysql.createPool(this.config.db.connection);
      await this.pool.query("SELECT 1");
      this.status = { ready: true, error: null };
    } catch {
      this.status = { ready: false, error: "schema_bootstrap_failed" };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getStatus(): DatabaseStatus {
    return this.status;
  }

  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error("database_not_configured");
    }
    return this.pool;
  }
}
