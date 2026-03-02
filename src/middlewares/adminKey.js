// src/middlewares/adminKey.js

export function createRequireAdmin(adminKey) {
  return function requireAdmin(req, res) {
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return false;
    }
    return true;
  };
}