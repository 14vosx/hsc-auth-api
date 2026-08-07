import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailLoginService,
  type PlayerEmailLoginPasswordPort,
  type PlayerEmailLoginRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-login.service.js";

function buildConfig(enabled = true): AppConfig {
  return {
    playerAuth: {
      cookieName: "hsc_player_session",
      ttlHours: 168,
    },
    playerEmailAuth: {
      enabled,
    },
  } as AppConfig;
}

function passwordPort(
  matches: boolean,
): PlayerEmailLoginPasswordPort {
  return {
    async verifyPasswordOrDummy() {
      return matches;
    },
  };
}

test("PlayerEmailLoginService - autentica identidade verificada e ativa", async () => {
  const repository: PlayerEmailLoginRepositoryPort = {
    async findByEmail(email) {
      assert.equal(email, "player@example.com");

      return {
        playerEmailIdentityId: "identity-id",
        playerAccountId: "account-id",
        passwordHash: "HASH",
        verified: true,
        accountStatus: "active",
      };
    },

    async recordLoginAndCreateSession(input) {
      assert.equal(input.sessionTtlHours, 168);

      return {
        ok: true,
        rawSessionToken: "RAW_SESSION",
      };
    },
  };

  const service = new PlayerEmailLoginService(
    buildConfig(),
    passwordPort(true),
    repository,
  );

  assert.deepEqual(
    await service.login({
      email: " Player@Example.COM ",
      password: "valid-password",
    }),
    {
      ok: true,
      rawSessionToken: "RAW_SESSION",
    },
  );
});

test("PlayerEmailLoginService - identidade inexistente usa dummy e retorna invalid_credentials", async () => {
  let dummyHash: string | null | undefined;

  const passwordService: PlayerEmailLoginPasswordPort = {
    async verifyPasswordOrDummy(_password, hash) {
      dummyHash = hash;
      return false;
    },
  };

  const repository: PlayerEmailLoginRepositoryPort = {
    async findByEmail() {
      return null;
    },

    async recordLoginAndCreateSession() {
      throw new Error("unexpected_session");
    },
  };

  const service = new PlayerEmailLoginService(
    buildConfig(),
    passwordService,
    repository,
  );

  const result = await service.login({
    email: "missing@example.com",
    password: "valid-password",
  });

  assert.equal(dummyHash, null);

  assert.deepEqual(result, {
    ok: false,
    error: "invalid_credentials",
  });
});

test("PlayerEmailLoginService - senha incorreta não revela estado da conta", async () => {
  const repository: PlayerEmailLoginRepositoryPort = {
    async findByEmail() {
      return {
        playerEmailIdentityId: "identity-id",
        playerAccountId: "account-id",
        passwordHash: "HASH",
        verified: false,
        accountStatus: "disabled",
      };
    },

    async recordLoginAndCreateSession() {
      throw new Error("unexpected_session");
    },
  };

  const service = new PlayerEmailLoginService(
    buildConfig(),
    passwordPort(false),
    repository,
  );

  assert.deepEqual(
    await service.login({
      email: "player@example.com",
      password: "wrong-password",
    }),
    {
      ok: false,
      error: "invalid_credentials",
    },
  );
});

test("PlayerEmailLoginService - senha correta exige email verificado", async () => {
  const repository: PlayerEmailLoginRepositoryPort = {
    async findByEmail() {
      return {
        playerEmailIdentityId: "identity-id",
        playerAccountId: "account-id",
        passwordHash: "HASH",
        verified: false,
        accountStatus: "active",
      };
    },

    async recordLoginAndCreateSession() {
      throw new Error("unexpected_session");
    },
  };

  const service = new PlayerEmailLoginService(
    buildConfig(),
    passwordPort(true),
    repository,
  );

  assert.deepEqual(
    await service.login({
      email: "player@example.com",
      password: "valid-password",
    }),
    {
      ok: false,
      error: "email_not_verified",
    },
  );
});

test("PlayerEmailLoginService - conta disabled não recebe sessão", async () => {
  const repository: PlayerEmailLoginRepositoryPort = {
    async findByEmail() {
      return {
        playerEmailIdentityId: "identity-id",
        playerAccountId: "account-id",
        passwordHash: "HASH",
        verified: true,
        accountStatus: "disabled",
      };
    },

    async recordLoginAndCreateSession() {
      throw new Error("unexpected_session");
    },
  };

  const service = new PlayerEmailLoginService(
    buildConfig(),
    passwordPort(true),
    repository,
  );

  assert.deepEqual(
    await service.login({
      email: "player@example.com",
      password: "valid-password",
    }),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );
});
