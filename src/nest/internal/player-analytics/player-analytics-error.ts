import { HttpStatus } from "@nestjs/common";

export class PlayerAnalyticsError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: string,
  ) {
    super(code);
  }
}
