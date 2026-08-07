export type MembershipStatus =
  | "inactive"
  | "active"
  | "suspended"
  | "expired"
  | "cancelled";

function requireMembershipStatus(
  status: MembershipStatus | string,
): MembershipStatus {
  if (
    status === "inactive" ||
    status === "active" ||
    status === "suspended" ||
    status === "expired" ||
    status === "cancelled"
  ) {
    return status;
  }

  throw new TypeError(
    "Membership status requires a valid status.",
  );
}

function toEpochMilliseconds(
  instant: Date | string | unknown,
): number {
  if (instant instanceof Date) {
    const milliseconds = instant.getTime();

    if (!Number.isFinite(milliseconds)) {
      throw new TypeError(
        "Membership status requires valid instants.",
      );
    }

    return milliseconds;
  }

  if (typeof instant === "string") {
    const match =
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
        instant,
      );

    if (!match) {
      throw new TypeError(
        "Membership status requires valid instants.",
      );
    }

    const [, year, month, day, hour, minute, second] =
      match.map(Number);

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
      throw new TypeError(
        "Membership status requires valid instants.",
      );
    }

    return milliseconds;
  }

  throw new TypeError(
    "Membership status requires valid instants.",
  );
}

export function resolveMembershipEffectiveStatus(input: {
  status: MembershipStatus | string;
  expiresAt: Date | string | null | unknown;
  now: Date | string | unknown;
}): MembershipStatus {
  const status = requireMembershipStatus(input.status);

  if (
    status === "expired" ||
    status === "cancelled" ||
    input.expiresAt === null ||
    input.expiresAt === undefined
  ) {
    return status;
  }

  if (
    toEpochMilliseconds(input.now) >=
    toEpochMilliseconds(input.expiresAt)
  ) {
    return "expired";
  }

  return status;
}
