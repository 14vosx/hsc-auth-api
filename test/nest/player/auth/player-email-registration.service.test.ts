import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailRegistrationService,
  type PlayerEmailRegistrationPasswordPort,
  type PlayerEmailRegistrationRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-registration.service.js";

function buildConfig(enabled = true): AppConfig {
  return {
    playerEmailAuth: {
      enabled,
      verificationTtlMinutes: 30,
      verificationUrl: "/portal/cs2-next/verify-email",
      fromEmail: "no-reply@haxixesmokeclub.com",
      verificationSubject: "Verify your HSC account",
    },
  } as AppConfig;
}

function buildPasswordPort(
  overrides: Partial<PlayerEmailRegistrationPasswordPort> = {},
): PlayerEmailRegistrationPasswordPort {
  return {
    isValidPassword() {
      return true;
    },

    async hashPassword() {
      return "HASHED_PASSWORD";
    },

    ...overrides,
  };
}

function buildRepositoryPort(
  overrides: Partial<PlayerEmailRegistrationRepositoryPort> = {},
): PlayerEmailRegistrationRepositoryPort {
  return {
    async createPendingRegistration() {
      throw new Error("unexpected_repository_call");
    },

    ...overrides,
  };
}

test("PlayerEmailRegistrationService - normaliza entrada e prepara verificação", async () => {
  const received: Array<Record<string, unknown>> = [];

  const passwordService = buildPasswordPort({
    async hashPassword(value: unknown) {
      assert.equal(value, "valid-password");
      return "HASHED_PASSWORD";
    },
  });

  const repository = buildRepositoryPort({
    async createPendingRegistration(input) {
      received.push(input);

      return {
        created: true,
        playerAccountId: "account-1",
        playerEmailIdentityId: "identity-1",
        rawVerificationToken: "RAW_TOKEN",
        verificationExpiresAt: "2026-08-07 16:00:00",
      };
    },
  });

  const service = new PlayerEmailRegistrationService(
    buildConfig(),
    passwordService,
    repository,
  );

  const result = await service.register({
    email: "  Player@Example.COM ",
    password: "valid-password",
    displayName: "  Player One  ",
  });

  assert.deepEqual(received, [
    {
      email: "player@example.com",
      passwordHash: "HASHED_PASSWORD",
      displayName: "Player One",
      verificationTtlMinutes: 30,
    },
  ]);

  assert.deepEqual(result, {
    ok: true,
    accepted: true,
    verificationDelivery: {
      email: "player@example.com",
      rawToken: "RAW_TOKEN",
      expiresAt: "2026-08-07 16:00:00",
    },
  });
});

test("PlayerEmailRegistrationService - e-mail existente preserva resposta genérica", async () => {
  const repository = buildRepositoryPort({
    async createPendingRegistration() {
      return {
        created: false,
      };
    },
  });

  const service = new PlayerEmailRegistrationService(
    buildConfig(),
    buildPasswordPort(),
    repository,
  );

  const result = await service.register({
    email: "existing@example.com",
    password: "valid-password",
  });

  assert.deepEqual(result, {
    ok: true,
    accepted: true,
    verificationDelivery: null,
  });
});

test("PlayerEmailRegistrationService - rejeita e-mail inválido antes do hash", async () => {
  let hashCalled = false;

  const passwordService = buildPasswordPort({
    async hashPassword() {
      hashCalled = true;
      return "HASHED_PASSWORD";
    },
  });

  const service = new PlayerEmailRegistrationService(
    buildConfig(),
    passwordService,
    buildRepositoryPort(),
  );

  const result = await service.register({
    email: "invalid-email",
    password: "valid-password",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "invalid_email",
  });

  assert.equal(hashCalled, false);
});

test("PlayerEmailRegistrationService - rejeita senha fora da política", async () => {
  const passwordService = buildPasswordPort({
    isValidPassword() {
      return false;
    },
  });

  const service = new PlayerEmailRegistrationService(
    buildConfig(),
    passwordService,
    buildRepositoryPort(),
  );

  const result = await service.register({
    email: "player@example.com",
    password: "short",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "invalid_password",
  });
});

test("PlayerEmailRegistrationService - rejeita display name inválido", async () => {
  const service = new PlayerEmailRegistrationService(
    buildConfig(),
    buildPasswordPort(),
    buildRepositoryPort(),
  );

  const result = await service.register({
    email: "player@example.com",
    password: "valid-password",
    displayName: { invalid: true },
  });

  assert.deepEqual(result, {
    ok: false,
    error: "invalid_display_name",
  });
});

test("PlayerEmailRegistrationService - feature desabilitada não processa cadastro", async () => {
  let passwordChecked = false;

  const passwordService = buildPasswordPort({
    isValidPassword() {
      passwordChecked = true;
      return true;
    },
  });

  const service = new PlayerEmailRegistrationService(
    buildConfig(false),
    passwordService,
    buildRepositoryPort(),
  );

  const result = await service.register({
    email: "player@example.com",
    password: "valid-password",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "player_email_auth_unavailable",
  });

  assert.equal(passwordChecked, false);
});
