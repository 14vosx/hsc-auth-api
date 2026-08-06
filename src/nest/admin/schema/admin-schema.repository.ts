import { Injectable, Inject } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";

export interface SchemaMetaResult {
  version: string | null;
  tables: string[];
}

interface SchemaVersionRow extends RowDataPacket {
  version: string;
}

interface TableNameRow extends RowDataPacket {
  TABLE_NAME: string;
}

@Injectable()
export class AdminSchemaRepository {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
  ) {}

  async getSchema(): Promise<SchemaMetaResult> {
    const pool = this.databaseService.getPool();

    const [versionRows] = await pool.execute<SchemaVersionRow[]>(
      `SELECT version FROM schema_meta LIMIT 1`,
    );

    const dbName = this.config.db.connection.database;
    if (!dbName) {
      throw new Error("database_not_configured");
    }

    const [tableRows] = await pool.execute<TableNameRow[]>(
      `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = ?
      `,
      [dbName],
    );

    return {
      version: versionRows[0]?.version ?? null,
      tables: tableRows.map((row) => row.TABLE_NAME),
    };
  }
}
