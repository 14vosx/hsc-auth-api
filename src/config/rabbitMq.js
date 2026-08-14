const DEFAULT_CONNECT_TIMEOUT_MS = 2_000;
const MAX_CONNECT_TIMEOUT_MS = 10_000;

function parseTimeout(value) {
  if (value === undefined || String(value).trim() === "") return DEFAULT_CONNECT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_CONNECT_TIMEOUT_MS) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  return parsed;
}

function parseRabbitUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const supportedProtocol = parsed.protocol === "amqp:" || parsed.protocol === "amqps:";
    return supportedProtocol && parsed.hostname.length > 0 ? raw : "";
  } catch {
    return "";
  }
}

export function buildRabbitMqConfig(env = process.env) {
  const url = parseRabbitUrl(env.RABBITMQ_URL);
  return {
    configured: url.length > 0,
    url,
    connectTimeoutMs: parseTimeout(env.RABBITMQ_CONNECT_TIMEOUT_MS),
  };
}
