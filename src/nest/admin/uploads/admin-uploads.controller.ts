import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UseFilters,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuthGuard } from "../auth/admin-auth.guard.js";
import { AdminIdentity } from "../auth/admin-auth.service.js";
import { AdminAuditEntry } from "../common/admin-audit.service.js";
import {
  getAllowedMimeTypes,
  isAllowedImageMime,
  createUploadFilename,
  detectAllowedImageMimeFromBuffer,
  buildPublicUploadUrl,
} from "./admin-upload-policy.js";
import { AdminUploadsService } from "./admin-uploads.service.js";
import { AdminUploadExceptionFilter } from "./admin-upload-exception.filter.js";

export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

@Controller("admin/uploads")
@UseGuards(AdminAuthGuard)
export class AdminUploadsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
    private readonly service: AdminUploadsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  @UseFilters(AdminUploadExceptionFilter)
  async create(
    @Req() req: RequestWithAdmin,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!file) {
      throw new HttpException(
        {
          ok: false,
          error: "missing_file",
          field: "file",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isAllowedImageMime(file.mimetype)) {
      throw new HttpException(
        {
          ok: false,
          error: "invalid_file_type",
          allowedMimeTypes: getAllowedMimeTypes(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const filename = createUploadFilename(file);
    if (!filename) {
      throw new HttpException(
        {
          ok: false,
          error: "invalid_file_type",
          allowedMimeTypes: getAllowedMimeTypes(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const detectedMime = detectAllowedImageMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      throw new HttpException(
        {
          ok: false,
          error: "invalid_file_signature",
          allowedMimeTypes: getAllowedMimeTypes(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (detectedMime !== String(file.mimetype || "").toLowerCase()) {
      throw new HttpException(
        {
          ok: false,
          error: "file_type_mismatch",
          declaredMimeType: file.mimetype,
          detectedMimeType: detectedMime,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const url = buildPublicUploadUrl(this.config.uploads, filename);
    if (!url) {
      throw new HttpException(
        { ok: false, error: "upload_url_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let filePath: string | null = null;
    try {
      filePath = await this.service.saveFile({
        uploadDir: this.config.uploads.uploadDir,
        filename,
        buffer: file.buffer,
      });
    } catch (_err) {
      if (filePath) {
        await this.service.removeFile(filePath);
      }
      throw new HttpException(
        { ok: false, error: "upload_validation_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const audit: AdminAuditEntry = {
      userId:
        typeof req.admin?.userId === "number" && Number.isInteger(req.admin.userId)
          ? req.admin.userId
          : null,
      route: "/admin/uploads",
      method: "POST",
      action: "upload.create",
      via: req.admin?.via === "session" ? "session" : "admin-key",
    };

    try {
      await this.service.insertAudit(audit);
    } catch (_err) {
      await this.service.removeFile(filePath);
      throw new HttpException(
        { ok: false, error: "audit_failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      ok: true,
      url,
      path: `${this.config.uploads.publicPath}/${encodeURIComponent(filename)}`,
      filename,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
