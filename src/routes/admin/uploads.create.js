import fs from "node:fs/promises";

import multer from "multer";

import {
  buildPublicUploadUrl,
  createUploadFilename,
  detectAllowedImageMimeFromFile,
  getAllowedMimeTypes,
  isAllowedImageMime,
} from "../../services/uploads/uploadPolicy.js";

function customUploadError(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function removeUploadedFile(file) {
  if (!file?.path) return;

  try {
    await fs.unlink(file.path);
  } catch {
    // Best effort cleanup only.
  }
}

function sendUploadError(res, err, uploadsConfig) {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      ok: false,
      error: "file_too_large",
      maxBytes: uploadsConfig.maxBytes,
    });
  }

  if (err?.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      ok: false,
      error: "unexpected_file_field",
      field: "file",
    });
  }

  if (err?.code === "invalid_file_type") {
    return res.status(400).json({
      ok: false,
      error: "invalid_file_type",
      allowedMimeTypes: getAllowedMimeTypes(),
    });
  }

  return res.status(400).json({
    ok: false,
    error: "upload_failed",
  });
}

export function registerAdminUploadsCreateRoute(app, {
  requireAdmin,
  getDbReady,
  dbConfig,
  runInTx,
  insertAdminAudit,
  uploadsConfig,
}) {
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      fs.mkdir(uploadsConfig.uploadDir, { recursive: true })
        .then(() => cb(null, uploadsConfig.uploadDir))
        .catch((err) => cb(err));
    },

    filename(_req, file, cb) {
      const filename = createUploadFilename(file);

      if (!filename) {
        cb(customUploadError("invalid_file_type"));
        return;
      }

      cb(null, filename);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: uploadsConfig.maxBytes,
      files: 1,
    },
    fileFilter(_req, file, cb) {
      if (!isAllowedImageMime(file.mimetype)) {
        cb(customUploadError("invalid_file_type"));
        return;
      }

      cb(null, true);
    },
  }).single("file");

  app.post("/admin/uploads", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    upload(req, res, async (err) => {
      if (err) {
        return sendUploadError(res, err, uploadsConfig);
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "missing_file",
          field: "file",
        });
      }

      try {
        const detectedMime = await detectAllowedImageMimeFromFile(req.file.path);

        if (!detectedMime) {
          await removeUploadedFile(req.file);

          return res.status(400).json({
            ok: false,
            error: "invalid_file_signature",
            allowedMimeTypes: getAllowedMimeTypes(),
          });
        }

        if (detectedMime !== req.file.mimetype) {
          await removeUploadedFile(req.file);

          return res.status(400).json({
            ok: false,
            error: "file_type_mismatch",
            declaredMimeType: req.file.mimetype,
            detectedMimeType: detectedMime,
          });
        }

        const url = buildPublicUploadUrl(uploadsConfig, req.file.filename);

        if (!url) {
          await removeUploadedFile(req.file);
          return res.status(500).json({ ok: false, error: "upload_url_error" });
        }

        try {
          await runInTx(dbConfig, async (conn) => {
            await insertAdminAudit(conn, {
              userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
              route: req.route?.path || req.originalUrl || "/admin/uploads",
              method: req.method,
              action: "upload.create",
              via: req.admin?.via === "session" ? "session" : "admin-key",
            });
          });
        } catch {
          await removeUploadedFile(req.file);
          return res.status(500).json({ ok: false, error: "audit_failed" });
        }

        return res.status(201).json({
          ok: true,
          url,
          path: `${uploadsConfig.publicPath}/${encodeURIComponent(req.file.filename)}`,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
        });
      } catch {
        await removeUploadedFile(req.file);
        return res.status(500).json({ ok: false, error: "upload_validation_error" });
      }
    });
  });
}
