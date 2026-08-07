import test from "node:test";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerCsrfGuard,
} from "../../../../src/nest/player/security/player-csrf.guard.js";

function config() {
  return {
    runtime: {
      publicUrl:
        "https://auth-api.haxixesmokeclub.com",
    },

    cors: {
      allowedOrigins: [
        "https://haxixesmokeclub.com",
        "https://backoffice.haxixesmokeclub.com",
      ],
    },
  };
}

function context(input: {
  method: string;
  origin?: string;
}) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return {
            method:
              input.method,

            headers: {
              origin:
                input.origin,
            },
          };
        },
      };
    },
  } as any;
}

function assertForbidden(
  error: unknown,
  code: string,
): boolean {
  assert.ok(
    error instanceof
      HttpException,
  );

  assert.equal(
    error.getStatus(),
    HttpStatus.FORBIDDEN,
  );

  const response =
    error.getResponse();

  assert.ok(
    response !== null &&
    typeof response === "object",
  );

  const payload =
    response as {
      error?: string;
    };

  assert.equal(
    payload.error,
    code,
  );

  return true;
}

test("csrf allows configured portal origin", () => {
  const guard =
    new PlayerCsrfGuard(
      config() as any,
    );

  assert.equal(
    guard.canActivate(
      context({
        method: "POST",
        origin:
          "https://haxixesmokeclub.com",
      }),
    ),
    true,
  );
});

test("csrf allows Auth API same origin", () => {
  const guard =
    new PlayerCsrfGuard(
      config() as any,
    );

  assert.equal(
    guard.canActivate(
      context({
        method: "PATCH",
        origin:
          "https://auth-api.haxixesmokeclub.com",
      }),
    ),
    true,
  );
});

test("csrf rejects missing Origin on unsafe request", () => {
  const guard =
    new PlayerCsrfGuard(
      config() as any,
    );

  assert.throws(
    () =>
      guard.canActivate(
        context({
          method: "POST",
        }),
      ),
    (error) =>
      assertForbidden(
        error,
        "csrf_origin_required",
      ),
  );
});

test("csrf rejects untrusted Origin", () => {
  const guard =
    new PlayerCsrfGuard(
      config() as any,
    );

  assert.throws(
    () =>
      guard.canActivate(
        context({
          method: "DELETE",
          origin:
            "https://evil.example",
        }),
      ),
    (error) =>
      assertForbidden(
        error,
        "csrf_origin_forbidden",
      ),
  );
});

test("csrf ignores safe GET", () => {
  const guard =
    new PlayerCsrfGuard(
      config() as any,
    );

  assert.equal(
    guard.canActivate(
      context({
        method: "GET",
      }),
    ),
    true,
  );
});
