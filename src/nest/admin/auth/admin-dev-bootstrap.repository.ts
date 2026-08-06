import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";

export interface LocalAdminUser {
  id: number;
  email: string;
  name: string;
  role: "admin";
}

interface RawUserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
}

@Injectable()
export class AdminDevBootstrapRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureLocalAdminUser(input: {
    email: string;
    name: string;
  }): Promise<LocalAdminUser> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      const [existingRows] = await connection.execute<RawUserRow[]>(
        `
          SELECT id, email, display_name, role
          FROM users
          WHERE email = ?
          LIMIT 1
        `,
        [input.email],
      );

      const existing = existingRows[0];
      if (existing) {
        if (existing.role !== "admin") {
          await connection.execute(
            `
              UPDATE users
              SET role = 'admin',
                  display_name = ?
              WHERE id = ?
            `,
            [input.name, existing.id],
          );
        }

        return {
          id: existing.id,
          email: input.email,
          name: input.name,
          role: "admin",
        };
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO users (email, display_name, role)
          VALUES (?, ?, 'admin')
        `,
        [input.email, input.name],
      );

      return {
        id: result.insertId,
        email: input.email,
        name: input.name,
        role: "admin",
      };
    } finally {
      connection.release();
    }
  }
}
