import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";

import {
  loadMigrationEnv,
  MIGRATION_ENV_LOAD_ERROR,
  resolveMigrationEnvPath,
} from "../../../scripts/migrate-env.js";

function syntheticProjectRoot() {
  return path.resolve(path.parse(process.cwd()).root, "synthetic", "repository");
}

function captureEnvironmentVariable(name) {
  return {
    present: Object.prototype.hasOwnProperty.call(process.env, name),
    value: process.env[name],
  };
}

function restoreEnvironmentVariable(name, previous) {
  if (previous.present) {
    process.env[name] = previous.value;
  } else {
    delete process.env[name];
  }
}

function assertSanitizedError(error, forbiddenText = []) {
  assert.equal(error instanceof Error, true);
  assert.equal(error.code, MIGRATION_ENV_LOAD_ERROR);
  assert.equal(error.message, MIGRATION_ENV_LOAD_ERROR);
  for (const property of ["cause", "path", "original"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(error, property), false);
  }

  const visibleError = String(error);
  const visibleStack = String(error.stack);
  for (const text of forbiddenText) {
    assert.equal(visibleError.includes(text), false);
    assert.equal(visibleStack.includes(text), false);
  }

  return true;
}

test("absolute ENV_FILE paths load once and preserve environment precedence", () => {
  const projectRoot = syntheticProjectRoot();
  const envFile = path.resolve(projectRoot, "external", "validation.env");
  const newVariable = "HSC_MIGRATION_ABSOLUTE_NEW";
  const existingVariable = "HSC_MIGRATION_ABSOLUTE_EXISTING";
  const emptyVariable = "HSC_MIGRATION_ABSOLUTE_EMPTY";
  const previous = new Map(
    [newVariable, existingVariable, emptyVariable].map((name) => [
      name,
      captureEnvironmentVariable(name),
    ]),
  );
  const readCalls = [];
  const parseCalls = [];
  const content = "synthetic absolute content";

  delete process.env[newVariable];
  process.env[existingVariable] = "preserved";
  process.env[emptyVariable] = "";
  try {
    assert.equal(resolveMigrationEnvPath({ projectRoot, envFile }), envFile);

    const result = loadMigrationEnv({
      projectRoot,
      envFile,
      readFile(filePath, encoding) {
        readCalls.push([filePath, encoding]);
        return content;
      },
      parseEnv(value) {
        parseCalls.push(value);
        return {
          [newVariable]: "loaded",
          [existingVariable]: "overwritten",
          [emptyVariable]: "overwritten",
        };
      },
    });

    assert.deepEqual(readCalls, [[envFile, "utf8"]]);
    assert.deepEqual(parseCalls, [content]);
    assert.deepEqual(result, { explicit: true, loaded: true, path: envFile });
    assert.equal(process.env[newVariable], "loaded");
    assert.equal(process.env[existingVariable], "preserved");
    assert.equal(process.env[emptyVariable], "");
  } finally {
    for (const [name, value] of previous) {
      restoreEnvironmentVariable(name, value);
    }
  }
});

test("relative ENV_FILE paths resolve from the repository root", () => {
  const projectRoot = syntheticProjectRoot();
  const envFile = path.join("config", "validation.env");
  const expectedPath = path.resolve(projectRoot, envFile);
  const variableName = "HSC_MIGRATION_RELATIVE_NEW";
  const previous = captureEnvironmentVariable(variableName);
  const readCalls = [];
  const parseCalls = [];
  const content = "relative content";

  delete process.env[variableName];
  try {
    assert.notEqual(expectedPath, path.resolve(process.cwd(), envFile));
    assert.equal(resolveMigrationEnvPath({ projectRoot, envFile }), expectedPath);

    const result = loadMigrationEnv({
      projectRoot,
      envFile,
      readFile(filePath, encoding) {
        readCalls.push([filePath, encoding]);
        return content;
      },
      parseEnv(value) {
        parseCalls.push(value);
        return { [variableName]: "loaded" };
      },
    });

    assert.deepEqual(readCalls, [[expectedPath, "utf8"]]);
    assert.deepEqual(parseCalls, [content]);
    assert.deepEqual(result, {
      explicit: true,
      loaded: true,
      path: expectedPath,
    });
    assert.equal(process.env[variableName], "loaded");
  } finally {
    restoreEnvironmentVariable(variableName, previous);
  }
});

test("load and parse failures are sanitized without partial application", () => {
  const projectRoot = syntheticProjectRoot();
  const envFile = path.resolve(projectRoot, "sensitive", "validation.env");
  const sensitiveDetail = "sensitive original failure detail";
  const partialVariable = "HSC_MIGRATION_PARTIAL_APPLICATION";
  const previousPartial = captureEnvironmentVariable(partialVariable);

  delete process.env[partialVariable];
  try {
    let readCalls = 0;
    let parseCalls = 0;
    assert.throws(
      () => loadMigrationEnv({
        projectRoot,
        envFile,
        readFile() {
          readCalls += 1;
          throw new Error(sensitiveDetail);
        },
        parseEnv() {
          parseCalls += 1;
          return {};
        },
      }),
      (error) => assertSanitizedError(error, [sensitiveDetail, envFile]),
    );
    assert.equal(readCalls, 1);
    assert.equal(parseCalls, 0);

    for (const invalidOptions of [null, "invalid", [], 42]) {
      assert.throws(
        () => loadMigrationEnv(invalidOptions),
        (error) => assertSanitizedError(error),
      );
    }

    for (const invalidDependency of [
      { readFile: null, parseEnv() {} },
      { readFile() {}, parseEnv: null },
    ]) {
      readCalls = 0;
      parseCalls = 0;
      assert.throws(
        () => loadMigrationEnv({
          projectRoot,
          envFile,
          readFile(...args) {
            readCalls += 1;
            return invalidDependency.readFile(...args);
          },
          parseEnv: invalidDependency.parseEnv === null
            ? null
            : (...args) => {
              parseCalls += 1;
              return invalidDependency.parseEnv(...args);
            },
          ...(invalidDependency.readFile === null ? { readFile: null } : {}),
        }),
        (error) => assertSanitizedError(error, [envFile]),
      );
      assert.equal(readCalls, 0);
      assert.equal(parseCalls, 0);
    }

    assert.throws(
      () => loadMigrationEnv({
        projectRoot: null,
        envFile,
        readFile() { readCalls += 1; },
        parseEnv() { parseCalls += 1; },
      }),
      (error) => assertSanitizedError(error, [envFile]),
    );
    assert.equal(readCalls, 0);
    assert.equal(parseCalls, 0);

    const invalidParserResults = [
      undefined,
      null,
      "invalid",
      [],
      { [partialVariable]: "would-be-applied", INVALID_VALUE: 42 },
    ];
    for (const invalidResult of invalidParserResults) {
      readCalls = 0;
      parseCalls = 0;
      assert.throws(
        () => loadMigrationEnv({
          projectRoot,
          envFile,
          readFile() {
            readCalls += 1;
            return "content";
          },
          parseEnv() {
            parseCalls += 1;
            return invalidResult;
          },
        }),
        (error) => assertSanitizedError(error, [envFile]),
      );
      assert.equal(readCalls, 1);
      assert.equal(parseCalls, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(process.env, partialVariable), false);
    }

    readCalls = 0;
    parseCalls = 0;
    assert.throws(
      () => loadMigrationEnv({
        projectRoot,
        envFile,
        readFile() {
          readCalls += 1;
          return "content";
        },
        parseEnv() {
          parseCalls += 1;
          throw new Error(sensitiveDetail);
        },
      }),
      (error) => assertSanitizedError(error, [sensitiveDetail, envFile]),
    );
    assert.equal(readCalls, 1);
    assert.equal(parseCalls, 1);
  } finally {
    restoreEnvironmentVariable(partialVariable, previousPartial);
  }
});

test("default .env fallback and real dotenv parsing are silent", () => {
  const projectRoot = syntheticProjectRoot();
  const expectedPath = path.resolve(projectRoot, ".env");
  const variableNames = [
    "DOTENV_CONFIG_DEBUG",
    "DOTENV_CONFIG_QUIET",
    "DOTENV_KEY",
    "HSC_MIGRATION_PARSE_PROBE",
  ];
  const previousEnvFile = captureEnvironmentVariable("ENV_FILE");
  const previousVariables = new Map(
    variableNames.map((name) => [name, captureEnvironmentVariable(name)]),
  );

  delete process.env.ENV_FILE;
  for (const name of variableNames) {
    delete process.env[name];
  }
  try {
    for (const caseOptions of [{}, { envFile: "" }, { envFile: "   " }]) {
      let readCalls = 0;
      let parseCalls = 0;
      const result = loadMigrationEnv({
        projectRoot,
        ...caseOptions,
        readFile(filePath, encoding) {
          readCalls += 1;
          assert.equal(filePath, expectedPath);
          assert.equal(encoding, "utf8");
          throw new Error("missing default file");
        },
        parseEnv() {
          parseCalls += 1;
          return {};
        },
      });

      assert.deepEqual(result, {
        explicit: false,
        loaded: false,
        path: expectedPath,
      });
      assert.equal(readCalls, 1);
      assert.equal(parseCalls, 0);
    }

    const content = [
      "DOTENV_CONFIG_DEBUG=true",
      "DOTENV_CONFIG_QUIET=false",
      "DOTENV_KEY=synthetic-key",
      "HSC_MIGRATION_PARSE_PROBE=loaded",
      "",
    ].join("\n");
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    let result;
    let readCalls = 0;

    process.stdout.write = function write(chunk, encoding, callback) {
      stdout += String(chunk);
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = function write(chunk, encoding, callback) {
      stderr += String(chunk);
      if (typeof callback === "function") callback();
      return true;
    };
    try {
      result = loadMigrationEnv({
        projectRoot,
        readFile(filePath, encoding) {
          readCalls += 1;
          assert.equal(filePath, expectedPath);
          assert.equal(encoding, "utf8");
          return content;
        },
      });
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.equal(stdout.length, 0);
    assert.equal(stderr.length, 0);
    assert.equal(readCalls, 1);
    assert.deepEqual(result, {
      explicit: false,
      loaded: true,
      path: expectedPath,
    });
    assert.equal(process.env.DOTENV_CONFIG_DEBUG, "true");
    assert.equal(process.env.DOTENV_CONFIG_QUIET, "false");
    assert.equal(process.env.DOTENV_KEY, "synthetic-key");
    assert.equal(process.env.HSC_MIGRATION_PARSE_PROBE, "loaded");
  } finally {
    restoreEnvironmentVariable("ENV_FILE", previousEnvFile);
    for (const [name, value] of previousVariables) {
      restoreEnvironmentVariable(name, value);
    }
  }
});
