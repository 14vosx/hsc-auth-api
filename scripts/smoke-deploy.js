import {
  randomBytes,
} from "node:crypto";

const DEFAULT_BASE_URL =
  "http://127.0.0.1:3000";

const REQUEST_TIMEOUT_MS =
  5000;

function normalizeBaseUrl(
  rawValue,
) {
  let url;

  try {
    url = new URL(
      String(
        rawValue ||
        DEFAULT_BASE_URL,
      ),
    );
  } catch {
    throw new Error(
      "invalid DEPLOY_SMOKE_BASE_URL",
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "DEPLOY_SMOKE_BASE_URL must use http or https",
    );
  }

  const allowedHosts =
    new Set([
      "127.0.0.1",
      "localhost",
      "::1",
      "[::1]",
    ]);

  if (
    !allowedHosts.has(
      url.hostname,
    )
  ) {
    throw new Error(
      "deploy smoke refuses non-loopback target",
    );
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url;
}

const baseUrl =
  normalizeBaseUrl(
    process.env
      .DEPLOY_SMOKE_BASE_URL,
  );

function buildUrl(path) {
  return new URL(
    path.replace(/^\/+/, ""),
    baseUrl,
  );
}

async function request(
  path,
  options = {},
) {
  let response;

  try {
    response =
      await fetch(
        buildUrl(path),
        {
          redirect: "manual",
          signal:
            AbortSignal.timeout(
              REQUEST_TIMEOUT_MS,
            ),
          ...options,
        },
      );
  } catch {
    throw new Error(
      `${options.method || "GET"} ${path}: request failed`,
    );
  }

  const raw =
    await response.text();

  let body = null;

  if (raw) {
    try {
      body =
        JSON.parse(raw);
    } catch {
      throw new Error(
        `${options.method || "GET"} ${path}: response is not JSON`,
      );
    }
  }

  return {
    status:
      response.status,
    body,
  };
}

function assertStatus(
  result,
  expected,
  label,
) {
  if (
    result.status !== expected
  ) {
    throw new Error(
      `${label}: expected HTTP ${expected}, got ${result.status}`,
    );
  }
}

function assertOkBody(
  result,
  label,
) {
  if (
    result.body === null ||
    typeof result.body !==
      "object" ||
    result.body.ok !== true
  ) {
    throw new Error(
      `${label}: expected body.ok=true`,
    );
  }
}

async function expectPublicOk(
  path,
  label,
) {
  const result =
    await request(path);

  assertStatus(
    result,
    200,
    label,
  );

  assertOkBody(
    result,
    label,
  );
}

async function expectUnauthorized(
  path,
  label,
) {
  const result =
    await request(path);

  assertStatus(
    result,
    401,
    label,
  );
}

async function main() {
  console.log(
    "HSC Auth API deploy smoke",
  );

  console.log(
    `Target: ${baseUrl.origin}`,
  );

  console.log(
    "Mode: existing application / read-only boundaries",
  );

  console.log();

  const health =
    await request(
      "/health",
    );

  assertStatus(
    health,
    200,
    "GET /health",
  );

  assertOkBody(
    health,
    "GET /health",
  );

  if (
    health.body.service !==
      "hsc-auth-api"
  ) {
    throw new Error(
      "GET /health: unexpected service",
    );
  }

  if (
    health.body.db?.ready !==
      true
  ) {
    throw new Error(
      "GET /health: database is not ready",
    );
  }

  console.log(
    "✓ health + database readiness",
  );

  await expectPublicOk(
    "/content/news",
    "GET /content/news",
  );

  await expectPublicOk(
    "/content/seasons",
    "GET /content/seasons",
  );

  await expectPublicOk(
    "/content/seasons/active",
    "GET /content/seasons/active",
  );

  console.log(
    "✓ public content contracts",
  );

  const playerRoutes = [
    "/player/account",
    "/player/profile/me",
    "/player/membership",
    "/player/bunker/summary",
  ];

  for (
    const path of playerRoutes
  ) {
    await expectUnauthorized(
      path,
      `GET ${path}`,
    );
  }

  console.log(
    "✓ player authentication boundaries",
  );

  await expectUnauthorized(
    "/admin/player-accounts",
    "GET /admin/player-accounts",
  );

  console.log(
    "✓ admin authentication boundary",
  );

  const deliberatelyInvalidKey =
    randomBytes(32)
      .toString("hex");

  const serverAccess =
    await request(
      "/internal/server-access/authorize",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "x-internal-key":
            deliberatelyInvalidKey,
        },
        body:
          JSON.stringify({
            steamid64:
              "99999999999999999",
          }),
      },
    );

  assertStatus(
    serverAccess,
    401,
    "POST /internal/server-access/authorize",
  );

  if (
    serverAccess.body?.error !==
      "invalid_internal_key"
  ) {
    throw new Error(
      "POST /internal/server-access/authorize: expected invalid_internal_key",
    );
  }

  console.log(
    "✓ internal Server Access credential boundary",
  );

  console.log();
  console.log(
    "✓ DEPLOY_SMOKE_OK",
  );
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "unknown failure";

  console.error();
  console.error(
    `✗ DEPLOY_SMOKE_FAILED: ${message}`,
  );

  process.exitCode = 1;
}
