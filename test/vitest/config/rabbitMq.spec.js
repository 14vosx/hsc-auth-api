import { describe, expect, it } from "vitest";
import { buildRabbitMqConfig } from "../../../src/config/rabbitMq.js";

describe("RabbitMQ config", () => {
  it("fica desconfigurado com URL vazia", () => {
    expect(buildRabbitMqConfig({})).toEqual({ configured: false, url: "", connectTimeoutMs: 2_000 });
  });

  it.each(["amqp://localhost", "amqps://user:pass@example.test/vhost"])(
    "aceita URL %s",
    (url) => expect(buildRabbitMqConfig({ RABBITMQ_URL: url })).toMatchObject({ configured: true, url }),
  );

  it("sanitiza URL inválida sem derrubar config", () => {
    expect(buildRabbitMqConfig({ RABBITMQ_URL: "https://example.test" })).toMatchObject({ configured: false, url: "" });
  });

  it("aceita timeout válido", () => {
    expect(buildRabbitMqConfig({ RABBITMQ_CONNECT_TIMEOUT_MS: "5000" }).connectTimeoutMs).toBe(5_000);
  });

  it.each(["0", "invalid", "10001"])("usa default para timeout inválido %s", (value) => {
    expect(buildRabbitMqConfig({ RABBITMQ_CONNECT_TIMEOUT_MS: value }).connectTimeoutMs).toBe(2_000);
  });
});
