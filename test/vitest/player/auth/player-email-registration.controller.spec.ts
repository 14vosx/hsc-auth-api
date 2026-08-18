import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerEmailRegistrationController,
  type PlayerEmailRegistrationDatabasePort,
  type PlayerEmailRegistrationServicePort,
  type PlayerEmailVerificationDeliveryPort,
} from "../../../../src/nest/player/auth/player-email-registration.controller.js";

function readyDatabase(
  ready = true,
): PlayerEmailRegistrationDatabasePort {
  return {
    getStatus() {
      return { ready };
    },
  };
}

test("PlayerEmailRegistrationController - cadastro novo entrega token e retorna somente resposta genérica", async () => {
  const deliveries: unknown[] = [];

  const registrationService:
    PlayerEmailRegistrationServicePort = {
      async register() {
        return {
          ok: true,
          accepted: true,
          verificationDelivery: {
            email: "player@example.com",
            rawToken: "SECRET_RAW_TOKEN",
            expiresAt: "2026-08-07 17:00:00",
          },
        };
      },
    };

  const deliveryService:
    PlayerEmailVerificationDeliveryPort = {
      async deliver(input) {
        deliveries.push(input);
      },
    };

  const controller =
    new PlayerEmailRegistrationController(
      readyDatabase(),
      registrationService,
      deliveryService,
    );

  const result = await controller.register({});

  assert.deepEqual(result, {
    ok: true,
    verificationRequired: true,
  });

  assert.equal(
    JSON.stringify(result).includes("SECRET_RAW_TOKEN"),
    false,
  );

  assert.equal(deliveries.length, 1);
});

test("PlayerEmailRegistrationController - email existente produz a mesma resposta pública", async () => {
  let deliveryCalled = false;

  const controller =
    new PlayerEmailRegistrationController(
      readyDatabase(),
      {
        async register() {
          return {
            ok: true,
            accepted: true,
            verificationDelivery: null,
          };
        },
      },
      {
        async deliver() {
          deliveryCalled = true;
        },
      },
    );

  const result = await controller.register({});

  assert.deepEqual(result, {
    ok: true,
    verificationRequired: true,
  });

  assert.equal(deliveryCalled, false);
});

test("PlayerEmailRegistrationController - entrada inválida retorna 400", async () => {
  const controller =
    new PlayerEmailRegistrationController(
      readyDatabase(),
      {
        async register() {
          return {
            ok: false,
            error: "invalid_email",
          };
        },
      },
      {
        async deliver() {},
      },
    );

  await assert.rejects(
    () => controller.register({}),
    (error) =>
      error instanceof HttpException &&
      error.getStatus() === HttpStatus.BAD_REQUEST,
  );
});

test("PlayerEmailRegistrationController - feature desabilitada retorna 501", async () => {
  const controller =
    new PlayerEmailRegistrationController(
      readyDatabase(),
      {
        async register() {
          return {
            ok: false,
            error: "player_email_auth_unavailable",
          };
        },
      },
      {
        async deliver() {},
      },
    );

  await assert.rejects(
    () => controller.register({}),
    (error) =>
      error instanceof HttpException &&
      error.getStatus() === HttpStatus.NOT_IMPLEMENTED,
  );
});

test("PlayerEmailRegistrationController - banco indisponível retorna 503 antes do serviço", async () => {
  let registrationCalled = false;

  const controller =
    new PlayerEmailRegistrationController(
      readyDatabase(false),
      {
        async register() {
          registrationCalled = true;

          return {
            ok: true,
            accepted: true,
            verificationDelivery: null,
          };
        },
      },
      {
        async deliver() {},
      },
    );

  await assert.rejects(
    () => controller.register({}),
    (error) =>
      error instanceof HttpException &&
      error.getStatus() ===
        HttpStatus.SERVICE_UNAVAILABLE,
  );

  assert.equal(registrationCalled, false);
});
