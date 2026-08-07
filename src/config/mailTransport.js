// src/config/mailTransport.js
import {
  parseBoolean,
  parsePort,
  parseString,
} from "./helpers.js";

export function buildMailTransportConfig(env = process.env) {
  return {
    host: parseString(env.SMTP_HOST, ""),
    port: parsePort(env.SMTP_PORT, 465, "SMTP_PORT"),
    secure: parseBoolean(
      env.SMTP_SECURE,
      false,
      "SMTP_SECURE",
    ),
    user: parseString(env.SMTP_USER, ""),
    pass: parseString(env.SMTP_PASS, ""),
  };
}
