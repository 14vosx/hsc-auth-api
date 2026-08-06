import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { AdminMagicLinkRequestService } from "./admin-magic-link-request.service.js";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If the account is allowed, a sign-in link has been sent.",
};

@Controller("auth")
export class AdminMagicLinkRequestController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly requestService: AdminMagicLinkRequestService,
  ) {}

  private async handleRequest(body: unknown) {
    if (!this.databaseService.getStatus().ready) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let email: unknown = undefined;
    if (body !== null && typeof body === "object" && "email" in body) {
      email = (body as Record<string, unknown>).email;
    }

    try {
      await this.requestService.request(email);
    } catch (_err) {
      console.error("[auth-magic-link] request failed");
    }

    return GENERIC_RESPONSE;
  }

  @Post("magic-link/request")
  async requestMagicLink(@Body() body: unknown) {
    return this.handleRequest(body);
  }

  @Post("request-link")
  async requestLink(@Body() body: unknown) {
    return this.handleRequest(body);
  }
}
