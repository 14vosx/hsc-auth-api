import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  ServerAccessController,
} from "../../../../src/nest/internal/server-access/server-access.controller.js";

const STEAMID64 =
  "76561198104061513";

function config(
  key = "server-access-secret",
) {
  return {
    serverAccess: {
      internalApiKey: key,
    },
  };
}

function database(
  ready = true,
) {
  return {
    getStatus() {
      return {
        ready,
      };
    },
  };
}

function contextualRepository() {
  return {
    async authorize() {
      throw new Error(
        "contextual repository should not be called by V1 tests",
      );
    },
  };
}

function assertHttpError(
  error: unknown,
  status: number,
  code: string,
): boolean {
  assert.ok(
    error instanceof
      HttpException,
  );

  assert.equal(
    error.getStatus(),
    status,
  );

  const response =
    error.getResponse();

  assert.equal(
    typeof response,
    "object",
  );

  assert.equal(
    (
      response as {
        error?: unknown;
      }
    ).error,
    code,
  );

  return true;
}

test("authorize - active membership returns HTTP business allow decision", async () => {
  let receivedSteamId:
    string | null = null;

  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {
        async authorizeBySteamId64(
          steamid64: string,
        ) {
          receivedSteamId =
            steamid64;

          return {
            authorized: true,
            reason:
              "membership_active",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  const result =
    await controller.authorize(
      "server-access-secret",
      {
        steamid64:
          STEAMID64,
      },
    );

  assert.equal(
    receivedSteamId,
    STEAMID64,
  );

  assert.deepEqual(
    result,
    {
      ok: true,
      authorized: true,
      reason:
        "membership_active",
    },
  );
});

test("authorize - business deny still returns normal decision payload", async () => {
  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {
        async authorizeBySteamId64() {
          return {
            authorized: false,
            reason:
              "membership_required",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  assert.deepEqual(
    await controller.authorize(
      "server-access-secret",
      {
        steamid64:
          STEAMID64,
      },
    ),
    {
      ok: true,
      authorized: false,
      reason:
        "membership_required",
    },
  );
});

test("authorize - missing configured internal key fails closed", async () => {
  let called = false;

  const controller =
    new ServerAccessController(
      config("") as any,
      database() as any,
      {
        async authorizeBySteamId64() {
          called = true;

          return {
            authorized: true,
            reason:
              "membership_active",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "anything",
      {
        steamid64:
          STEAMID64,
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus
          .SERVICE_UNAVAILABLE,
        "internal_api_key_not_configured",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("authorize - invalid internal key fails before database decision", async () => {
  let called = false;

  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {
        async authorizeBySteamId64() {
          called = true;

          return {
            authorized: true,
            reason:
              "membership_active",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "wrong-secret",
      {
        steamid64:
          STEAMID64,
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.UNAUTHORIZED,
        "invalid_internal_key",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("authorize - database not ready fails closed", async () => {
  let called = false;

  const controller =
    new ServerAccessController(
      config() as any,
      database(false) as any,
      {
        async authorizeBySteamId64() {
          called = true;

          return {
            authorized: true,
            reason:
              "membership_active",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "server-access-secret",
      {
        steamid64:
          STEAMID64,
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus
          .SERVICE_UNAVAILABLE,
        "db_not_ready",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("authorize - invalid SteamID64 is rejected before repository access", async () => {
  let called = false;

  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {
        async authorizeBySteamId64() {
          called = true;

          return {
            authorized: true,
            reason:
              "membership_active",
          };
        },
      } as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "server-access-secret",
      {
        steamid64:
          "STEAM_1:0:123",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_steamid64",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("authorize - expanded body is rejected", async () => {
  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {} as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "server-access-secret",
      {
        steamid64:
          STEAMID64,
        force: true,
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_body",
      ),
  );
});

test("authorize - repository failure is sanitized and never grants", async () => {
  const controller =
    new ServerAccessController(
      config() as any,
      database() as any,
      {
        async authorizeBySteamId64() {
          throw new Error(
            "sensitive database failure",
          );
        },
      } as any,
      contextualRepository() as any,
    );

  await assert.rejects(
    controller.authorize(
      "server-access-secret",
      {
        steamid64:
          STEAMID64,
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus
          .INTERNAL_SERVER_ERROR,
        "server_access_authorization_failed",
      ),
  );
});
