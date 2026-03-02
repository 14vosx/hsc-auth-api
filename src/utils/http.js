// src/utils/http.js

export function sendPublic(res, data) {
  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    data,
  });
}

export function sendError(res, status, code, extra) {
  const payload = { ok: false, error: code };
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  return res.status(status).json(payload);
}

export function sendBadRequest(res, code, extra) {
  return sendError(res, 400, code || "bad_request", extra);
}

export function sendNotFound(res, code, extra) {
  return sendError(res, 404, code || "not_found", extra);
}

export function sendConflict(res, code, extra) {
  return sendError(res, 409, code || "conflict", extra);
}