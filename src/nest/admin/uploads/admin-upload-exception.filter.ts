import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";

@Catch()
export class AdminUploadExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status: number | null = null;
    let message = "";
    let exceptionResponse: unknown = null;

    if (exception && typeof exception === "object") {
      const errObj = exception as Record<string, unknown>;

      if (typeof errObj.getStatus === "function") {
        status = (errObj.getStatus as () => number)();
      }

      if (typeof errObj.getResponse === "function") {
        exceptionResponse = (errObj.getResponse as () => unknown)();

        if (typeof exceptionResponse === "string") {
          message = exceptionResponse;
        } else if (
          exceptionResponse &&
          typeof exceptionResponse === "object" &&
          !Array.isArray(exceptionResponse)
        ) {
          const respObj = exceptionResponse as Record<string, unknown>;
          if (typeof respObj.message === "string") {
            message = respObj.message;
          } else if (Array.isArray(respObj.message)) {
            message = respObj.message.join(" ");
          }
        }
      }

      if (!message && typeof errObj.message === "string") {
        message = errObj.message;
      }
    } else if (typeof exception === "string") {
      message = exception;
    }

    if (
      status !== null &&
      exceptionResponse &&
      typeof exceptionResponse === "object" &&
      !Array.isArray(exceptionResponse)
    ) {
      const payload = exceptionResponse as Record<string, unknown>;

      if (payload.ok === false && typeof payload.error === "string") {
        return response.status(status).json(exceptionResponse);
      }
    }

    const lowerMessage = message.toLowerCase();

    if (
      status === HttpStatus.PAYLOAD_TOO_LARGE ||
      lowerMessage.includes("file too large")
    ) {
      return response.status(413).json({
        ok: false,
        error: "file_too_large",
        maxBytes: this.config.uploads.maxBytes,
      });
    }

    if (lowerMessage.includes("unexpected field")) {
      return response.status(400).json({
        ok: false,
        error: "unexpected_file_field",
        field: "file",
      });
    }

    return response.status(400).json({
      ok: false,
      error: "upload_failed",
    });
  }
}
