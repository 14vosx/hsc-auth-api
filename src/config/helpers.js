// src/config/helpers.js

export class ConfigError extends Error {
  constructor(key, reason) {
    super(`Invalid configuration for ${key}: ${reason}`);
    this.name = "ConfigError";
    this.key = key;
    this.reason = reason;
  }
}

export function parseString(value, defaultVal = "") {
  if (value === undefined || value === null) {
    return defaultVal;
  }

  return String(value).trim();
}

export function parsePositiveInt(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ConfigError(key, "must be a positive integer");
  }

  return num;
}

export function parsePort(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new ConfigError(key, "must be a valid port integer (1-65535)");
  }

  return num;
}

export function parseBoolean(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const str = String(value).trim().toLowerCase();
  if (str === "true") {
    return true;
  }
  if (str === "false") {
    return false;
  }

  throw new ConfigError(key, "must be a boolean (true or false)");
}

export function parseAbsoluteUrl(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const str = String(value).trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(str);
  } catch {
    throw new ConfigError(key, "must be an absolute http or https URL");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ConfigError(key, "must be an absolute http or https URL");
  }

  return str.replace(/\/+$/, "");
}

export function parseRedirectUrl(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const str = String(value).trim();
  if (str.startsWith("/")) {
    return str;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(str);
  } catch {
    throw new ConfigError(
      key,
      "must be a path starting with / or an absolute http/https URL",
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ConfigError(
      key,
      "must be a path starting with / or an absolute http/https URL",
    );
  }

  return str;
}

export function parseHttpPath(value, defaultVal, key) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultVal;
  }

  const str = String(value).trim();
  if (!str.startsWith("/")) {
    throw new ConfigError(key, "must be an HTTP path starting with /");
  }

  return str;
}
