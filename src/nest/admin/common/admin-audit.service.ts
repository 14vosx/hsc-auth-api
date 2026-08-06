import { Injectable } from "@nestjs/common";
import type { PoolConnection } from "mysql2/promise";

export interface AdminAuditEntry {
  userId: number | null;
  route: string;
  method: string;
  action: string;
  via: "session" | "admin-key";
  entityType?: string | null;
  entityKey?: string | null;
}

@Injectable()
export class AdminAuditService {
  async insert(
    connection: PoolConnection,
    entry: AdminAuditEntry,
  ): Promise<void> {
    await connection.execute(
      `
        INSERT INTO admin_audit_log
        (user_id, route, method, action, via, entity_type, entity_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entry.userId,
        entry.route,
        entry.method,
        entry.action,
        entry.via,
        entry.entityType ?? null,
        entry.entityKey ?? null,
      ],
    );
  }
}
