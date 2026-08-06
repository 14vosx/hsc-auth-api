import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuditService, AdminAuditEntry } from "../common/admin-audit.service.js";

export interface AdminUserItem {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawAdminUserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateAdminUserInput {
  email: string;
  displayName: string;
  role: string;
}

export interface UpdateAdminUserInput {
  email?: string;
  displayName?: string;
  role?: string;
}

export class AdminUserNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("not_found");
    this.name = "AdminUserNotFoundError";
  }
}

@Injectable()
export class AdminUsersRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async listUsers(): Promise<AdminUserItem[]> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawAdminUserRow[]>(
      `
        SELECT id, email, display_name, role, created_at, updated_at
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async createUser(
    input: CreateAdminUserInput,
    audit: AdminAuditEntry,
  ): Promise<AdminUserItem> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `
            INSERT INTO users (email, display_name, role)
            VALUES (?, ?, ?)
          `,
          [input.email, input.displayName, input.role],
        );

        await this.adminAuditService.insert(connection, audit);

        const [rows] = await connection.execute<RawAdminUserRow[]>(
          `
            SELECT id, email, display_name, role, created_at, updated_at
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [result.insertId],
        );

        const item = rows[0];
        if (!item) {
          throw new Error("created_user_not_found");
        }

        await connection.commit();

        return {
          id: item.id,
          email: item.email,
          display_name: item.display_name,
          role: item.role,
          created_at: item.created_at,
          updated_at: item.updated_at,
        };
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

  async updateUser(
    id: number,
    input: UpdateAdminUserInput,
    audit: AdminAuditEntry,
  ): Promise<AdminUserItem> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.email !== undefined) {
      updates.push("email = ?");
      params.push(input.email);
    }

    if (input.displayName !== undefined) {
      updates.push("display_name = ?");
      params.push(input.displayName);
    }

    if (input.role !== undefined) {
      updates.push("role = ?");
      params.push(input.role);
    }

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.query<ResultSetHeader>(
          `
            UPDATE users
            SET ${updates.join(", ")}
            WHERE id = ?
          `,
          [...params, id],
        );

        if (result.affectedRows === 0) {
          throw new AdminUserNotFoundError();
        }

        await this.adminAuditService.insert(connection, audit);

        const [rows] = await connection.execute<RawAdminUserRow[]>(
          `
            SELECT id, email, display_name, role, created_at, updated_at
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [id],
        );

        const item = rows[0];
        if (!item) {
          throw new AdminUserNotFoundError();
        }

        await connection.commit();

        return {
          id: item.id,
          email: item.email,
          display_name: item.display_name,
          role: item.role,
          created_at: item.created_at,
          updated_at: item.updated_at,
        };
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
