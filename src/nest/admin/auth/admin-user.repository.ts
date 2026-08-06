import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

export interface EligibleAdminUser {
  id: number;
  email: string;
  name: string | null;
  role: "admin";
}

interface RawUserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
}

@Injectable()
export class AdminUserRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findEligibleAdminByEmail(
    email: string,
  ): Promise<EligibleAdminUser | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawUserRow[]>(
      `
        SELECT id, email, display_name, role
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    if (row.role !== "admin") {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      name: row.display_name,
      role: "admin",
    };
  }
}
