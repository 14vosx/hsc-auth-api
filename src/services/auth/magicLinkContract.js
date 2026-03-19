// src/services/auth/magicLinkContract.js

export const MAGIC_LINK_REQUEST_OK_MESSAGE =
  "If the account is allowed, a sign-in link has been sent.";

export const MAGIC_LINK_CALLBACK_STATUS_OK = "ok";

export const MAGIC_LINK_CALLBACK_ERROR_DB_NOT_READY = "db_not_ready";
export const MAGIC_LINK_CALLBACK_ERROR_MISSING_TOKEN = "missing_token";
export const MAGIC_LINK_CALLBACK_ERROR_INVALID_OR_EXPIRED_LINK =
  "invalid_or_expired_link";
export const MAGIC_LINK_CALLBACK_ERROR_FORBIDDEN = "forbidden";
export const MAGIC_LINK_CALLBACK_ERROR_CONSUME_FAILED = "consume_failed";

export function buildMagicLinkRequestOkResponse() {
  return {
    ok: true,
    message: MAGIC_LINK_REQUEST_OK_MESSAGE,
  };
}