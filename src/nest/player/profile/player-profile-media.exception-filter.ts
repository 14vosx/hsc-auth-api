import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import {
  APP_CONFIG,
  type AppConfig,
} from "../../core/app-config.js";

@Catch()
export class PlayerProfileMediaExceptionFilter
  implements ExceptionFilter
{
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const response =
      host
        .switchToHttp()
        .getResponse();

    let status: number | null = null;
    let message = "";
    let exceptionResponse:
      unknown = null;

    if (
      exception &&
      typeof exception === "object"
    ) {
      const error =
        exception as Record<
          string,
          unknown
        >;

      if (
        typeof error.getStatus ===
        "function"
      ) {
        status =
          (
            error.getStatus as
              () => number
          )();
      }

      if (
        typeof error.getResponse ===
        "function"
      ) {
        exceptionResponse =
          (
            error.getResponse as
              () => unknown
          )();

        if (
          typeof exceptionResponse ===
          "string"
        ) {
          message =
            exceptionResponse;
        } else if (
          exceptionResponse &&
          typeof exceptionResponse ===
            "object" &&
          !Array.isArray(
            exceptionResponse,
          )
        ) {
          const payload =
            exceptionResponse as Record<
              string,
              unknown
            >;

          if (
            typeof payload.message ===
            "string"
          ) {
            message =
              payload.message;
          } else if (
            Array.isArray(
              payload.message,
            )
          ) {
            message =
              payload.message.join(
                " ",
              );
          }
        }
      }

      if (
        !message &&
        typeof error.message ===
          "string"
      ) {
        message =
          error.message;
      }
    } else if (
      typeof exception === "string"
    ) {
      message = exception;
    }

    if (
      status !== null &&
      exceptionResponse &&
      typeof exceptionResponse ===
        "object" &&
      !Array.isArray(
        exceptionResponse,
      )
    ) {
      const payload =
        exceptionResponse as Record<
          string,
          unknown
        >;

      if (
        payload.ok === false &&
        typeof payload.error ===
          "string"
      ) {
        return response
          .status(status)
          .json(
            exceptionResponse,
          );
      }
    }

    const lowerMessage =
      message.toLowerCase();

    if (
      status ===
        HttpStatus.PAYLOAD_TOO_LARGE ||
      lowerMessage.includes(
        "file too large",
      )
    ) {
      return response
        .status(
          HttpStatus.PAYLOAD_TOO_LARGE,
        )
        .json({
          ok: false,
          error: "file_too_large",
          maxBytes:
            this.config.uploads
              .maxBytes,
        });
    }

    if (
      lowerMessage.includes(
        "unexpected field",
      )
    ) {
      return response
        .status(
          HttpStatus.BAD_REQUEST,
        )
        .json({
          ok: false,
          error:
            "unexpected_file_field",
          field: "file",
        });
    }

    return response
      .status(
        HttpStatus.BAD_REQUEST,
      )
      .json({
        ok: false,
        error: "upload_failed",
      });
  }
}
