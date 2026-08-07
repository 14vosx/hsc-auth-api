import {
  createHash,
} from "node:crypto";

export function normalizeRateLimitEmail(
  input: unknown,
): string {
  if (typeof input !== "string") {
    return "__missing__";
  }

  const value =
    input
      .trim()
      .toLowerCase();

  if (
    !value ||
    value.length > 255
  ) {
    return "__invalid__";
  }

  return value;
}

export function buildRateLimitTracker(
  namespace: string,
  value: string,
): string {
  const cleanNamespace =
    String(
      namespace ?? "",
    ).trim();

  const cleanValue =
    String(
      value ?? "",
    ).trim();

  if (
    !cleanNamespace ||
    !cleanValue
  ) {
    throw new TypeError(
      "Invalid rate limit tracker input.",
    );
  }

  return createHash("sha256")
    .update(cleanNamespace)
    .update("\0")
    .update(cleanValue)
    .digest("hex");
}
