// src/middlewares/adminAuth.js
import { ADMIN_SESSION_COOKIE } from "../config/auth.js";
import { findActiveSessionByToken } from "../db/adminSessions.js";
import { parseCookieHeader } from "../utils/cookies.js";

function buildSessionAdmin(session) {
  return {
    via: "session",
    userId: Number.isInteger(session.userId) ? session.userId : null,
    role: session.role ?? null,
    email: session.email ?? null,
    name: session.name ?? null,
    sessionId: session.sessionId ?? null,
  };
}

function buildAdminKeyAdmin() {
  return {
    via: "admin-key",
    userId: null,
    role: "admin",
    email: null,
    name: null,
    sessionId: null,
  };
}

export function createAdminAuth({ adminKey, dbConfig }) {
  async function resolveSessionAdmin(req) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const rawToken = cookies[ADMIN_SESSION_COOKIE];

    if (!rawToken) {
      return null;
    }

    const session = await findActiveSessionByToken(dbConfig, rawToken);
    if (!session) {
      return null;
    }

    /**
     * Neste primeiro corte, rotas admin continuam exigindo role=admin.
     * Abertura para viewer/editor pode vir em PR posterior com autorização fina.
     */
    if (session.role !== "admin") {
      return null;
    }

    return buildSessionAdmin(session);
  }

  async function resolveAdmin(req) {
    if (req.admin) {
      return req.admin;
    }

    const sessionAdmin = await resolveSessionAdmin(req);
    if (sessionAdmin) {
      req.admin = sessionAdmin;
      return req.admin;
    }

    if (adminKey && req.headers["x-admin-key"] === adminKey) {
      req.admin = buildAdminKeyAdmin();
      return req.admin;
    }

    return null;
  }

  async function requireAdmin(req, res) {
    const admin = await resolveAdmin(req);

    if (!admin) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return false;
    }

    return true;
  }

  return {
    resolveSessionAdmin,
    resolveAdmin,
    requireAdmin,
  };
}