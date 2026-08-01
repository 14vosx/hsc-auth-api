export const SEASON_STATUSES = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
});

export const SEASON_LIFECYCLE_ERROR_CODES = Object.freeze({
  ALREADY_ACTIVE: 'season_already_active',
  ACTIVE_CONFLICT: 'season_active_conflict',
  NOT_STARTED: 'season_not_started',
  EXPIRED: 'season_expired',
  NOT_ACTIVE: 'season_not_active',
  CLOSED: 'season_closed',
});

const ERROR_MESSAGES = Object.freeze({
  [SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE]: 'Season is already active.',
  [SEASON_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT]: 'Another Season is active.',
  [SEASON_LIFECYCLE_ERROR_CODES.NOT_STARTED]: 'Season has not started.',
  [SEASON_LIFECYCLE_ERROR_CODES.EXPIRED]: 'Season has expired.',
  [SEASON_LIFECYCLE_ERROR_CODES.NOT_ACTIVE]: 'Season is not active.',
  [SEASON_LIFECYCLE_ERROR_CODES.CLOSED]: 'Season is closed.',
});

export class SeasonLifecycleError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] ?? 'Season lifecycle validation failed.');
    this.name = 'SeasonLifecycleError';
    this.code = code;
  }
}

function toEpochMilliseconds(instant) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new TypeError('Season lifecycle requires valid instants.');
  }

  return instant.getTime();
}

export function assertSeasonCanActivate({
  status,
  startAt,
  endAt,
  now,
  hasOtherActiveSeason,
}) {
  if (status === SEASON_STATUSES.ACTIVE) {
    throw new SeasonLifecycleError(
      SEASON_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
    );
  }

  if (status === SEASON_STATUSES.CLOSED) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.CLOSED);
  }

  if (hasOtherActiveSeason) {
    throw new SeasonLifecycleError(
      SEASON_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT,
    );
  }

  if (status !== SEASON_STATUSES.DRAFT) {
    throw new TypeError('Season lifecycle requires a valid status.');
  }

  const nowMilliseconds = toEpochMilliseconds(now);

  if (nowMilliseconds < toEpochMilliseconds(startAt)) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.NOT_STARTED);
  }

  if (nowMilliseconds >= toEpochMilliseconds(endAt)) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.EXPIRED);
  }

  return true;
}

export function assertSeasonCanClose({ status }) {
  if (status === SEASON_STATUSES.ACTIVE) {
    return true;
  }

  if (status === SEASON_STATUSES.CLOSED) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.CLOSED);
  }

  if (status === SEASON_STATUSES.DRAFT) {
    throw new SeasonLifecycleError(SEASON_LIFECYCLE_ERROR_CODES.NOT_ACTIVE);
  }

  throw new TypeError('Season lifecycle requires a valid status.');
}

export function shouldAutoCloseSeason({ status, endAt, now }) {
  if (status !== SEASON_STATUSES.ACTIVE) {
    return false;
  }

  return toEpochMilliseconds(endAt) <= toEpochMilliseconds(now);
}
