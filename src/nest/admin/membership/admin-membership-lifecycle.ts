import {
  MembershipStatus,
  resolveMembershipEffectiveStatus,
} from "../../membership/membership-status.js";

export type { MembershipStatus };

export const MEMBERSHIP_LIFECYCLE_ERROR_CODES = {
  ALREADY_ACTIVE: "membership_already_active",
  ALREADY_SUSPENDED: "membership_already_suspended",
  ALREADY_CANCELLED: "membership_already_cancelled",
  NOT_INACTIVE: "membership_not_inactive",
  NOT_ACTIVE: "membership_not_active",
  NOT_SUSPENDED: "membership_not_suspended",
  NOT_CANCELLABLE: "membership_not_cancellable",
  EXPIRED: "membership_expired",
  CANCELLED: "membership_cancelled",
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE]:
    "Membership is already active.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_SUSPENDED]:
    "Membership is already suspended.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_CANCELLED]:
    "Membership is already cancelled.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_INACTIVE]:
    "Membership is not inactive.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_ACTIVE]:
    "Membership is not active.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_SUSPENDED]:
    "Membership is not suspended.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_CANCELLABLE]:
    "Membership cannot be cancelled from its current state.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED]:
    "Membership is expired.",
  [MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED]:
    "Membership is cancelled.",
};

export class MembershipLifecycleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(
      ERROR_MESSAGES[code] ??
        "Membership lifecycle validation failed.",
    );
    this.name = "MembershipLifecycleError";
    this.code = code;
  }
}

interface MembershipLifecycleInput {
  status: MembershipStatus | string;
  expiresAt?: Date | string | null | unknown;
  now?: Date | string | unknown;
}

function effectiveStatus(
  input: MembershipLifecycleInput,
): MembershipStatus {
  return resolveMembershipEffectiveStatus({
    status: input.status,
    expiresAt: input.expiresAt ?? null,
    now: input.now ?? new Date(0),
  });
}

export function assertMembershipCanGrant(input: {
  expiresAt: Date | string | null | unknown;
  now: Date | string | unknown;
}): boolean {
  const status = resolveMembershipEffectiveStatus({
    status: "active",
    expiresAt: input.expiresAt,
    now: input.now,
  });

  if (status === "expired") {
    throw new MembershipLifecycleError(
      MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
    );
  }

  return true;
}

export function assertMembershipCanActivate(
  input: MembershipLifecycleInput,
): boolean {
  const status = effectiveStatus(input);

  switch (status) {
    case "inactive":
      return true;
    case "active":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
      );
    case "suspended":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_INACTIVE,
      );
    case "expired":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
      );
    case "cancelled":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
      );
  }
}

export function assertMembershipCanSuspend(
  input: MembershipLifecycleInput,
): boolean {
  const status = effectiveStatus(input);

  switch (status) {
    case "active":
      return true;
    case "suspended":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_SUSPENDED,
      );
    case "inactive":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_ACTIVE,
      );
    case "expired":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
      );
    case "cancelled":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
      );
  }
}

export function assertMembershipCanReactivate(
  input: MembershipLifecycleInput,
): boolean {
  const status = effectiveStatus(input);

  switch (status) {
    case "suspended":
      return true;
    case "active":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
      );
    case "inactive":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_SUSPENDED,
      );
    case "expired":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
      );
    case "cancelled":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
      );
  }
}

export function assertMembershipCanCancel(
  input: MembershipLifecycleInput,
): boolean {
  const status = effectiveStatus(input);

  switch (status) {
    case "active":
    case "suspended":
      return true;
    case "inactive":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_CANCELLABLE,
      );
    case "expired":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
      );
    case "cancelled":
      throw new MembershipLifecycleError(
        MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_CANCELLED,
      );
  }
}
