export type SeasonStatus = "draft" | "active" | "closed";

export const SEASON_LIFECYCLE_ERROR_CODES = {
  ALREADY_ACTIVE: "season_already_active",
  ACTIVE_CONFLICT: "season_active_conflict",
  NOT_STARTED: "season_not_started",
  EXPIRED: "season_expired",
  NOT_ACTIVE: "season_not_active",
  CLOSED: "season_closed",
  ALREADY_CLOSED: "season_already_closed",
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  [SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE]: "Season is already active.",
  [SEASON_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT]: "Another Season is active.",
  [SEASON_LIFECYCLE_ERROR_CODES.NOT_STARTED]: "Season has not started.",
  [SEASON_LIFECYCLE_ERROR_CODES.EXPIRED]: "Season has expired.",
  [SEASON_LIFECYCLE_ERROR_CODES.NOT_ACTIVE]: "Season is not active.",
  [SEASON_LIFECYCLE_ERROR_CODES.CLOSED]: "Season is closed.",
  [SEASON_LIFECYCLE_ERROR_CODES.ALREADY_CLOSED]: "Season is already closed.",
};

export class SeasonLifecycleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(ERROR_MESSAGES[code] ?? "Season lifecycle validation failed.");
    this.name = "SeasonLifecycleError";
    this.code = code;
  }
}

function toEpochMilliseconds(instant: Date | string | unknown): number {
  if (instant instanceof Date) {
    if (!Number.isFinite(instant.getTime())) {
      throw new TypeError("Season lifecycle requires valid instants.");
    }
    return instant.getTime();
  }

  if (typeof instant === "string") {
    const match =
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
        instant,
      );

    if (!match) {
      throw new TypeError("Season lifecycle requires valid instants.");
    }

    const [, year, month, day, hour, minute, second] = match.map(Number);
    const milliseconds = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
    );
    const date = new Date(milliseconds);

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute ||
      date.getUTCSeconds() !== second
    ) {
      throw new TypeError("Season lifecycle requires valid instants.");
    }

    return milliseconds;
  }

  throw new TypeError("Season lifecycle requires valid instants.");
}

export function assertSeasonCanActivate(input: {
  status: SeasonStatus | string;
  startAt: Date | string | unknown;
  endAt: Date | string | unknown;
  now: Date;
  hasOtherActiveSeason: boolean;
}): boolean {
  if (input.status === "active") {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE);
  }

  if (input.status === "closed") {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.CLOSED);
  }

  if (input.hasOtherActiveSeason) {
    throw new SeasonLifecycleError(
      SEASON_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT,
    );
  }

  if (input.status !== "draft") {
    throw new TypeError("Season lifecycle requires a valid status.");
  }

  const nowMilliseconds = toEpochMilliseconds(input.now);

  if (nowMilliseconds < toEpochMilliseconds(input.startAt)) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.NOT_STARTED);
  }

  if (nowMilliseconds >= toEpochMilliseconds(input.endAt)) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.EXPIRED);
  }

  return true;
}

export function assertSeasonCanClose(input: {
  status: SeasonStatus | string;
}): boolean {
  if (input.status === "active") {
    return true;
  }

  if (input.status === "closed") {
    throw new SeasonLifecycleError(
      SEASON_LIFECYCLE_ERROR_CODES.ALREADY_CLOSED,
    );
  }

  if (input.status === "draft") {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.NOT_ACTIVE);
  }

  throw new TypeError("Season lifecycle requires a valid status.");
}
