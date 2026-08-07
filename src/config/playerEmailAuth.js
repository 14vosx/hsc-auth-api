// src/config/playerEmailAuth.js
import {
  ConfigError,
  parseBoolean,
  parsePositiveInt,
  parseRedirectUrl,
  parseString,
} from "./helpers.js";

export function buildPlayerEmailAuthConfig(
  env = process.env,
  mailTransport = {},
) {
  const enabled = parseBoolean(
    env.PLAYER_EMAIL_AUTH_ENABLED,
    false,
    "PLAYER_EMAIL_AUTH_ENABLED",
  );

  const config = {
    enabled,
    verificationTtlMinutes: parsePositiveInt(
      env.PLAYER_EMAIL_VERIFICATION_TTL_MINUTES,
      30,
      "PLAYER_EMAIL_VERIFICATION_TTL_MINUTES",
    ),
    verificationUrl: parseRedirectUrl(
      env.PLAYER_EMAIL_VERIFICATION_URL,
      "/portal/cs2-next/verify-email",
      "PLAYER_EMAIL_VERIFICATION_URL",
    ),
    fromEmail: parseString(
      env.PLAYER_EMAIL_FROM,
      "no-reply@haxixesmokeclub.com",
    ),
    verificationSubject: parseString(
      env.PLAYER_EMAIL_VERIFICATION_SUBJECT,
      "Verify your HSC account",
    ),
  };

  if (!enabled) {
    return config;
  }

  if (!mailTransport.host) {
    throw new ConfigError(
      "SMTP_HOST",
      "must be configured when PLAYER_EMAIL_AUTH_ENABLED=true",
    );
  }

  if (!mailTransport.user) {
    throw new ConfigError(
      "SMTP_USER",
      "must be configured when PLAYER_EMAIL_AUTH_ENABLED=true",
    );
  }

  if (!mailTransport.pass) {
    throw new ConfigError(
      "SMTP_PASS",
      "must be configured when PLAYER_EMAIL_AUTH_ENABLED=true",
    );
  }

  if (!config.fromEmail) {
    throw new ConfigError(
      "PLAYER_EMAIL_FROM",
      "must be configured when PLAYER_EMAIL_AUTH_ENABLED=true",
    );
  }

  if (!config.verificationSubject) {
    throw new ConfigError(
      "PLAYER_EMAIL_VERIFICATION_SUBJECT",
      "must be configured when PLAYER_EMAIL_AUTH_ENABLED=true",
    );
  }

  return config;
}
