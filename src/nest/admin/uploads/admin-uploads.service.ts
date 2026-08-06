import { Injectable } from "@nestjs/common";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuditService, AdminAuditEntry } from "../common/admin-audit.service.js";

@Injectable()
export class AdminUploadsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async saveFile(input: {
    uploadDir: string;
    filename: string;
    buffer: Buffer;
  }): Promise<string> {
    const safeFilename = basename(input.filename);
    if (!safeFilename || safeFilename !== input.filename) {
      throw new Error("invalid_generated_filename");
    }

    await mkdir(input.uploadDir, { recursive: true });
    const filepath = join(input.uploadDir, safeFilename);

    await writeFile(filepath, input.buffer, { flag: "wx" });
    return filepath;
  }

  async removeFile(filePath: string | null | undefined): Promise<void> {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      // Best effort cleanup only.
    }
  }

  async insertAudit(audit: AdminAuditEntry): Promise<void> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        await this.adminAuditService.insert(connection, audit);
        await connection.commit();
      } catch (err) {
        try {
          await connection.rollback();
        } catch {}
        throw err;
      }
    } finally {
      connection.release();
    }
  }
}
