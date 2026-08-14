export const GENERATION_ID_PATTERN =
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\d{6}Z-[0-9a-f]{8}$/;

export type PlayerAnalyticsState =
  | "incoming"
  | "accepted"
  | "current"
  | "rejected"
  | "not_found";

export function isValidGenerationId(value: string): boolean {
  const match = GENERATION_ID_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);

  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute)
    && date.getUTCSeconds() === Number(second);
}
