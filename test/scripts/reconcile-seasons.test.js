import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { main } from "../../scripts/reconcile-seasons.js";

const VALID_DB_CONFIG = Object.freeze({
  host: "db.internal",
  port: 3306,
  user: "secret-user",
  password: "secret-password",
  database: "secret-database",
  timezone: "Z",
});

function createStream() {
  let output = "";
  return {
    write(chunk) {
      output += String(chunk);
      return true;
    },
    output() {
      return output;
    },
  };
}

function createThrowingStream() {
  let attempts = 0;
  let output = "";
  return {
    write(chunk) {
      attempts += 1;
      output += String(chunk);
      throw new Error("secret stream failure");
    },
    attempts() {
      return attempts;
    },
    output() {
      return output;
    },
  };
}

async function withProcessStderrCapture(operation, { throwAfterWrite = false } = {}) {
  const originalWrite = process.stderr.write;
  let attempts = 0;
  let output = "";

  process.stderr.write = function write(chunk) {
    attempts += 1;
    output += String(chunk);
    if (throwAfterWrite) throw new Error("secret process stderr failure");
    return true;
  };

  try {
    const value = await operation();
    return { attempts, output, value };
  } finally {
    process.stderr.write = originalWrite;
  }
}

function parseSingleJsonLine(stream) {
  const output = stream.output();
  assert.match(output, /^.*\n$/);
  assert.equal(output.endsWith("\n\n"), false);
  const lines = output.split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1], "");
  return JSON.parse(lines[0]);
}

function assertNoSecrets(output) {
  assert.doesNotMatch(
    output,
    /secret-user|secret-password|secret-database|db\.internal|cleanup secret/i,
  );
}

function createHarness(result) {
  if (arguments.length === 0) {
    result = {
      ok: true,
      outcome: "no_active",
      cleanupWarnings: [],
    };
  }

  const calls = [];
  const stdout = createStream();
  const stderr = createStream();
  let reconcileCalls = 0;
  let createRepoCalls = 0;

  const dependencies = {
    loadEnvFn() {
      calls.push("loadEnv");
    },
    buildDbConfigFn() {
      calls.push("buildDbConfig");
      return VALID_DB_CONFIG;
    },
    createSeasonsRepoFn(dbConfig) {
      calls.push("createSeasonsRepo");
      createRepoCalls += 1;
      assert.equal(dbConfig, VALID_DB_CONFIG);
      return {
        async reconcileExpiredActiveSeason() {
          calls.push("reconcile");
          reconcileCalls += 1;
          if (result instanceof Error) throw result;
          return result;
        },
      };
    },
    stdout,
    stderr,
  };

  return {
    calls,
    dependencies,
    stdout,
    stderr,
    getCreateRepoCalls: () => createRepoCalls,
    getReconcileCalls: () => reconcileCalls,
  };
}

async function runResult(result) {
  const harness = createHarness(result);
  const exitCodeBefore = process.exitCode;
  const exitCode = await main(harness.dependencies);
  assert.equal(process.exitCode, exitCodeBefore);
  assertNoSecrets(harness.stdout.output());
  assertNoSecrets(harness.stderr.output());
  return { ...harness, exitCode };
}

test("importing the module does not execute main", () => {
  const moduleUrl = new URL(
    "../../scripts/reconcile-seasons.js",
    import.meta.url,
  ).href;
  const probe = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `
      const module = await import(${JSON.stringify(moduleUrl)});
      if (typeof module.main !== "function") process.exitCode = 9;
    `],
    { encoding: "utf8" },
  );

  assert.equal(probe.status, 0);
  assert.equal(probe.stdout, "");
  assert.equal(probe.stderr, "");
  assert.equal(typeof main, "function");
});

test("closed returns zero and writes one sanitized stdout line", async () => {
  const harness = await runResult({
    ok: true,
    outcome: "closed",
    slug: "season-slug",
    cleanupWarnings: [],
  });

  assert.equal(harness.exitCode, 0);
  assert.deepEqual(parseSingleJsonLine(harness.stdout), {
    ok: true,
    outcome: "closed",
    slug: "season-slug",
    cleanupWarningCount: 0,
  });
  assert.equal(harness.stderr.output(), "");
});

test("no_active returns zero without a slug", async () => {
  const harness = await runResult({
    ok: true,
    outcome: "no_active",
    cleanupWarnings: [],
  });

  assert.equal(harness.exitCode, 0);
  assert.deepEqual(parseSingleJsonLine(harness.stdout), {
    ok: true,
    outcome: "no_active",
    cleanupWarningCount: 0,
  });
  assert.equal(harness.stderr.output(), "");
});

test("not_expired returns zero and includes the slug", async () => {
  const harness = await runResult({
    ok: true,
    outcome: "not_expired",
    slug: "season-slug",
    cleanupWarnings: [],
  });

  assert.equal(harness.exitCode, 0);
  assert.deepEqual(parseSingleJsonLine(harness.stdout), {
    ok: true,
    outcome: "not_expired",
    slug: "season-slug",
    cleanupWarningCount: 0,
  });
  assert.equal(harness.stderr.output(), "");
});

test("skipped_busy remains a successful result without a slug", async () => {
  const harness = await runResult({
    ok: true,
    outcome: "skipped_busy",
    cleanupWarnings: [],
  });

  assert.equal(harness.exitCode, 0);
  assert.deepEqual(parseSingleJsonLine(harness.stdout), {
    ok: true,
    outcome: "skipped_busy",
    cleanupWarningCount: 0,
  });
  assert.equal(harness.stderr.output(), "");
});

test("stable repository failures preserve only approved codes", async () => {
  for (const error of [
    "season_active_invariant_violation",
    "season_auto_close_failed",
  ]) {
    const harness = await runResult({ ok: false, error, cleanupWarnings: [] });
    assert.equal(harness.exitCode, 1);
    assert.equal(harness.stdout.output(), "");
    assert.deepEqual(parseSingleJsonLine(harness.stderr), {
      ok: false,
      error,
      cleanupWarningCount: 0,
    });
  }
});

test("tx_failed is preserved and unknown repository codes are sanitized", async () => {
  for (const [receivedError, expectedError] of [
    ["tx_failed", "tx_failed"],
    ["private_database_failure", "tx_failed"],
  ]) {
    const harness = await runResult({
      ok: false,
      error: receivedError,
      details: "private SQL detail",
      cleanupWarnings: [],
    });
    assert.equal(harness.exitCode, 1);
    assert.equal(harness.stdout.output(), "");
    assert.deepEqual(parseSingleJsonLine(harness.stderr), {
      ok: false,
      error: expectedError,
      cleanupWarningCount: 0,
    });
    assert.doesNotMatch(harness.stderr.output(), /private|SQL|database_failure/);
  }
});

test("invalid configuration returns two before repository creation", async () => {
  const craftedArray = [];
  Object.assign(craftedArray, VALID_DB_CONFIG);
  const invalidConfigurations = [
    { ...VALID_DB_CONFIG, port: 0 },
    [],
    craftedArray,
    { ...VALID_DB_CONFIG, host: "   " },
    { ...VALID_DB_CONFIG, user: "   " },
    { ...VALID_DB_CONFIG, database: "   " },
  ];
  const builders = [
    ...invalidConfigurations.map((configuration) => () => configuration),
    () => {
      throw new Error("secret configuration stack");
    },
  ];

  for (const buildDbConfigFn of builders) {
    const stdout = createStream();
    const stderr = createStream();
    let createRepoCalls = 0;
    let reconcileCalls = 0;
    const exitCode = await main({
      loadEnvFn() {},
      buildDbConfigFn,
      createSeasonsRepoFn() {
        createRepoCalls += 1;
        return {
          reconcileExpiredActiveSeason() {
            reconcileCalls += 1;
          },
        };
      },
      stdout,
      stderr,
    });

    assert.equal(exitCode, 2);
    assert.equal(createRepoCalls, 0);
    assert.equal(reconcileCalls, 0);
    assert.equal(stdout.output(), "");
    assert.deepEqual(parseSingleJsonLine(stderr), {
      ok: false,
      error: "invalid_configuration",
      cleanupWarningCount: 0,
    });
    assert.doesNotMatch(stderr.output(), /secret|stack/);
    assertNoSecrets(stderr.output());
  }
});

test("unexpected post-configuration exceptions are sanitized", async () => {
  const scenarios = [
    () => {
      throw new Error("secret factory message");
    },
    () => null,
    () => ({}),
    () => ({
      async reconcileExpiredActiveSeason() {
        const sensitive = new Error("secret MariaDB message");
        sensitive.stack = "secret stack with SQL";
        throw sensitive;
      },
    }),
  ];

  for (const createSeasonsRepoFn of scenarios) {
    const stdout = createStream();
    const stderr = createStream();
    const exitCode = await main({
      loadEnvFn() {},
      buildDbConfigFn() {
        return VALID_DB_CONFIG;
      },
      createSeasonsRepoFn,
      stdout,
      stderr,
    });

    assert.equal(exitCode, 1);
    assert.equal(stdout.output(), "");
    assert.deepEqual(parseSingleJsonLine(stderr), {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    });
    assert.doesNotMatch(stderr.output(), /secret|MariaDB|factory|stack|SQL/);
  }
});

test("cleanup warnings expose only their count and preserve success", async () => {
  const harness = await runResult({
    ok: true,
    outcome: "closed",
    slug: "season-slug",
    cleanupWarnings: [
      { stage: "release_lock", message: "cleanup secret one" },
      new Error("cleanup secret two"),
    ],
  });

  assert.equal(harness.exitCode, 0);
  assert.deepEqual(parseSingleJsonLine(harness.stdout), {
    ok: true,
    outcome: "closed",
    slug: "season-slug",
    cleanupWarningCount: 2,
  });
  assert.equal(harness.stderr.output(), "");
  assert.doesNotMatch(harness.stdout.output(), /release_lock|connection_end|cleanup secret/);

  const failedStdout = createThrowingStream();
  const successHarness = createHarness({
    ok: true,
    outcome: "no_active",
    cleanupWarnings: [],
  });
  successHarness.dependencies.stdout = failedStdout;
  const successExitCode = await main(successHarness.dependencies);
  assert.equal(successExitCode, 1);
  assert.equal(failedStdout.attempts(), 1);
  assert.equal(successHarness.stderr.output(), "");
  assert.doesNotMatch(failedStdout.output(), /secret stream failure/);

  const failedStderr = createThrowingStream();
  const failureHarness = createHarness({
    ok: false,
    error: "tx_failed",
    cleanupWarnings: [],
  });
  failureHarness.dependencies.stderr = failedStderr;
  const failureExitCode = await main(failureHarness.dependencies);
  assert.equal(failureExitCode, 1);
  assert.equal(failedStderr.attempts(), 1);
  assert.equal(failureHarness.stdout.output(), "");
  assert.doesNotMatch(failedStderr.output(), /secret stream failure/);
});

test("dependencies are called in order and repository work runs exactly once", async () => {
  const harness = createHarness();
  const exitCodeBefore = process.exitCode;
  const exitCode = await main(harness.dependencies);

  assert.equal(exitCode, 0);
  assert.equal(process.exitCode, exitCodeBefore);
  assert.deepEqual(harness.calls, [
    "loadEnv",
    "buildDbConfig",
    "createSeasonsRepo",
    "reconcile",
  ]);
  assert.equal(harness.getCreateRepoCalls(), 1);
  assert.equal(harness.getReconcileCalls(), 1);
  assertNoSecrets(harness.stdout.output());
  assertNoSecrets(harness.stderr.output());
  parseSingleJsonLine(harness.stdout);

  const invalidContainers = [null, "invalid", 42, true, [], () => {}];
  for (const dependencies of invalidContainers) {
    const exitCodeBeforeInvalid = process.exitCode;
    const captured = await withProcessStderrCapture(() => main(dependencies));
    assert.equal(captured.value, 1);
    assert.equal(captured.attempts, 1);
    assert.deepEqual(JSON.parse(captured.output.trim()), {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    });
    assert.equal(captured.output.endsWith("\n"), true);
    assert.equal(process.exitCode, exitCodeBeforeInvalid);
    assertNoSecrets(captured.output);
  }

  const invalidProperties = [
    ["loadEnvFn", null],
    ["buildDbConfigFn", null],
    ["createSeasonsRepoFn", null],
    ["stdout", null],
    ["stdout", {}],
  ];
  for (const [property, value] of invalidProperties) {
    let dependencyCalls = 0;
    const stderr = createStream();
    const dependencies = {
      loadEnvFn() {
        dependencyCalls += 1;
      },
      buildDbConfigFn() {
        dependencyCalls += 1;
        return VALID_DB_CONFIG;
      },
      createSeasonsRepoFn() {
        dependencyCalls += 1;
        return { reconcileExpiredActiveSeason() {} };
      },
      stdout: createStream(),
      stderr,
      [property]: value,
    };

    const invalidExitCode = await main(dependencies);
    assert.equal(invalidExitCode, 1);
    assert.equal(dependencyCalls, 0);
    assert.deepEqual(parseSingleJsonLine(stderr), {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    });
  }

  for (const invalidStderr of [null, {}]) {
    let dependencyCalls = 0;
    const captured = await withProcessStderrCapture(() => main({
      loadEnvFn() {
        dependencyCalls += 1;
      },
      buildDbConfigFn() {
        dependencyCalls += 1;
        return VALID_DB_CONFIG;
      },
      createSeasonsRepoFn() {
        dependencyCalls += 1;
        return { reconcileExpiredActiveSeason() {} };
      },
      stdout: createStream(),
      stderr: invalidStderr,
    }));
    assert.equal(captured.value, 1);
    assert.equal(captured.attempts, 1);
    assert.equal(dependencyCalls, 0);
    assert.deepEqual(JSON.parse(captured.output), {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    });
  }

  const failedProcessStderr = await withProcessStderrCapture(
    () => main(null),
    { throwAfterWrite: true },
  );
  assert.equal(failedProcessStderr.value, 1);
  assert.equal(failedProcessStderr.attempts, 1);
});

test("malformed successful results become internal errors", async () => {
  for (const result of [
    { ok: true, outcome: "private_outcome", secret: "original object" },
    { ok: true, outcome: "closed", secret: "original object" },
    { ok: true, outcome: "closed", slug: "" },
    { ok: true, outcome: "closed", slug: "   " },
    { ok: true, outcome: "not_expired" },
    { ok: true, outcome: "not_expired", slug: "   " },
    { ok: true },
    { ok: "true", outcome: "no_active" },
    [],
    null,
    undefined,
  ]) {
    const harness = await runResult(result);
    assert.equal(harness.exitCode, 1);
    assert.equal(harness.stdout.output(), "");
    assert.deepEqual(parseSingleJsonLine(harness.stderr), {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    });
    assert.doesNotMatch(harness.stderr.output(), /private_outcome|original object/);
  }
});
