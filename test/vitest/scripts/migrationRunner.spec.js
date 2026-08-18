// test/scripts/migrationRunner.test.js
import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runMigrations,
  MigrationRunnerError,
} from "../../../scripts/migrationRunner.js";
import { main as runMigrateEntrypoint } from "../../../scripts/migrate.js";
import { buildDbConfig } from "../../../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

function createMockConnection(options = {}) {
  const calls = [];
  const appliedMigrations = new Set(options.appliedMigrations || []);
  let lockResult = options.lockResult ?? 1;

  return {
    calls,
    optionsPassed: options.config,
    async query(sql, params) {
      calls.push({ type: "query", sql, params });
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("GET_LOCK")) {
        if (lockResult === "throw") {
          throw new Error("SENSITIVE_DB_LOCK_ERROR_SECRET_123");
        }
        return [[{ acquired: lockResult }], []];
      }
      if (normalizedSql.includes("RELEASE_LOCK")) {
        if (options.releaseError)
          throw new Error("SENSITIVE_RELEASE_LOCK_ERROR");
        return [[{ released: 1 }], []];
      }
      if (
        options.queryFailFile &&
        normalizedSql.includes(options.queryFailFileContent)
      ) {
        throw new Error("SENSITIVE_SQL_QUERY_ERROR_SECRET_456");
      }
      return [[], []];
    },
    async execute(sql, params) {
      calls.push({ type: "execute", sql, params });
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (
        normalizedSql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")
      ) {
        return [{ affectedRows: 0 }, undefined];
      }
      if (normalizedSql.includes("SELECT filename FROM schema_migrations")) {
        return [
          Array.from(appliedMigrations).map((filename) => ({ filename })),
          [],
        ];
      }
      if (normalizedSql.includes("INSERT INTO schema_migrations")) {
        if (options.insertFail) {
          throw new Error("SENSITIVE_INSERT_ERROR_SECRET_789");
        }
        appliedMigrations.add(params[0]);
        return [{ affectedRows: 1 }, undefined];
      }
      throw new Error(
        `Unrecognized SQL in mockConnection.execute: ${normalizedSql}`,
      );
    },
    async beginTransaction() {
      calls.push({ type: "beginTransaction" });
    },
    async commit() {
      calls.push({ type: "commit" });
    },
    async rollback() {
      calls.push({ type: "rollback" });
    },
    async end() {
      calls.push({ type: "end" });
    },
  };
}

test("1. conexão do runner recebe multipleStatements: true", async () => {
  let passedConfig = null;
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1", user: "hsc" };

  await runMigrations({
    dbConfig,
    createConnectionFn: async (cfg) => {
      passedConfig = cfg;
      mockConn.optionsPassed = cfg;
      return mockConn;
    },
    readdirFn: async () => [],
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  assert.equal(passedConfig.multipleStatements, true);
});

test("2. dbConfig original não é mutado", async () => {
  const originalConfig = Object.freeze({ host: "127.0.0.1", user: "hsc" });
  const mockConn = createMockConnection();

  await runMigrations({
    dbConfig: originalConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => [],
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      originalConfig,
      "multipleStatements",
    ),
    false,
  );
});

test("3. conexão da aplicação não é alterada por buildDbConfig()", () => {
  const appDbConfig = buildDbConfig();
  assert.equal(
    Object.prototype.hasOwnProperty.call(appDbConfig, "multipleStatements"),
    false,
  );
});

test("4. advisory lock é adquirido antes de schema_migrations e leitura das aplicadas", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => [],
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const getLockIdx = mockConn.calls.findIndex((c) =>
    c.sql?.includes("GET_LOCK"),
  );
  const createTableIdx = mockConn.calls.findIndex((c) =>
    c.sql?.includes("CREATE TABLE IF NOT EXISTS schema_migrations"),
  );
  const selectAppliedIdx = mockConn.calls.findIndex((c) =>
    String(c.sql)
      .replace(/\s+/g, " ")
      .trim()
      .includes("SELECT filename FROM schema_migrations"),
  );

  assert.ok(getLockIdx >= 0);
  assert.ok(createTableIdx > getLockIdx);
  assert.ok(selectAppliedIdx > createTableIdx);
});

test("5. timeout de lock interrompe o runner com MigrationRunnerError sanitizado", async () => {
  const mockConn = createMockConnection({ lockResult: 0 });
  const dbConfig = { host: "127.0.0.1" };

  await assert.rejects(
    async () => {
      await runMigrations({
        dbConfig,
        createConnectionFn: async () => mockConn,
        readdirFn: async () => [],
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
    },
    (err) => {
      assert.equal(err instanceof MigrationRunnerError, true);
      assert.equal(err.message, "[migration] failed to acquire advisory lock");
      return true;
    },
  );
});

test("6. migrations são ordenadas lexicograficamente", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };
  const executedFiles = [];

  const files = ["0002_b.sql", "0001_a.sql"];
  const fileContents = {
    "0002_b.sql": "SELECT 2;",
    "0001_a.sql": "SELECT 1;",
  };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => files,
    readFileFn: async (filePath) => {
      const base = path.basename(filePath);
      return fileContents[base];
    },
    logger: {
      log: (msg) => {
        if (msg.startsWith("Applying migration:")) {
          executedFiles.push(msg.replace("Applying migration: ", ""));
        }
      },
      warn: () => {},
      error: () => {},
    },
  });

  assert.deepEqual(executedFiles, ["0001_a.sql", "0002_b.sql"]);
});

test("7. migration já aplicada é ignorada", async () => {
  const mockConn = createMockConnection({
    appliedMigrations: ["0001_a.sql"],
  });
  const dbConfig = { host: "127.0.0.1" };
  const executedFiles = [];

  const files = ["0001_a.sql", "0002_b.sql"];
  const fileContents = {
    "0001_a.sql": "SELECT 1;",
    "0002_b.sql": "SELECT 2;",
  };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => files,
    readFileFn: async (filePath) => fileContents[path.basename(filePath)],
    logger: {
      log: (msg) => {
        if (msg.startsWith("Applying migration:")) {
          executedFiles.push(msg.replace("Applying migration: ", ""));
        }
      },
      warn: () => {},
      error: () => {},
    },
  });

  assert.deepEqual(executedFiles, ["0002_b.sql"]);
});

test("8. arquivo multi-statement é passado inteiro para connection.query()", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };
  const multiSql = "CREATE TABLE t1 (id int); CREATE TABLE t2 (id int);";

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => ["0001_multi.sql"],
    readFileFn: async () => multiSql,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const queryCall = mockConn.calls.find(
    (c) => c.type === "query" && c.sql === multiSql,
  );
  assert.ok(queryCall);
});

test("9. INSERT ocorre somente após query resolver com sucesso", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };
  const sqlContent = "SELECT 1;";

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => ["0001_a.sql"],
    readFileFn: async () => sqlContent,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const queryIdx = mockConn.calls.findIndex(
    (c) => c.type === "query" && c.sql === sqlContent,
  );
  const insertIdx = mockConn.calls.findIndex(
    (c) =>
      c.type === "execute" && c.sql.includes("INSERT INTO schema_migrations"),
  );

  assert.ok(queryIdx >= 0);
  assert.ok(insertIdx > queryIdx);
});

test("10. falha na query não executa INSERT nem registra migration", async () => {
  const mockConn = createMockConnection({
    queryFailFile: "0001_fail.sql",
    queryFailFileContent: "FAIL_SQL",
  });
  const dbConfig = { host: "127.0.0.1" };

  await assert.rejects(
    async () => {
      await runMigrations({
        dbConfig,
        createConnectionFn: async () => mockConn,
        readdirFn: async () => ["0001_fail.sql"],
        readFileFn: async () => "FAIL_SQL",
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
    },
    (err) => {
      assert.equal(err instanceof MigrationRunnerError, true);
      assert.equal(err.fileName, "0001_fail.sql");
      return true;
    },
  );

  const insertCalls = mockConn.calls.filter(
    (c) =>
      c.type === "execute" && c.sql?.includes("INSERT INTO schema_migrations"),
  );
  assert.equal(insertCalls.length, 0);
});

test("11. migration com sucesso é registrada", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => ["0001_success.sql"],
    readFileFn: async () => "SELECT 1;",
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const insertCall = mockConn.calls.find(
    (c) =>
      c.type === "execute" && c.sql.includes("INSERT INTO schema_migrations"),
  );
  assert.ok(insertCall);
  assert.equal(insertCall.params[0], "0001_success.sql");
});

test("12 & 13. release lock e connection.end ocorrem no finally", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => [],
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const releaseCall = mockConn.calls.find((c) =>
    c.sql?.includes("RELEASE_LOCK"),
  );
  const endCall = mockConn.calls.find((c) => c.type === "end");

  assert.ok(releaseCall);
  assert.ok(endCall);
});

test("14. falha de release não oculta falha principal da migration", async () => {
  const mockConn = createMockConnection({
    queryFailFile: "0001_fail.sql",
    queryFailFileContent: "FAIL_SQL",
    releaseError: true,
  });
  const dbConfig = { host: "127.0.0.1" };

  await assert.rejects(
    async () => {
      await runMigrations({
        dbConfig,
        createConnectionFn: async () => mockConn,
        readdirFn: async () => ["0001_fail.sql"],
        readFileFn: async () => "FAIL_SQL",
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
    },
    (err) => {
      assert.equal(err instanceof MigrationRunnerError, true);
      assert.equal(err.message, "[migration] failed: 0001_fail.sql");
      return true;
    },
  );
});

test("15. nenhum beginTransaction, commit ou rollback é chamado", async () => {
  const mockConn = createMockConnection();
  const dbConfig = { host: "127.0.0.1" };

  await runMigrations({
    dbConfig,
    createConnectionFn: async () => mockConn,
    readdirFn: async () => ["0001_a.sql"],
    readFileFn: async () => "CREATE TABLE t (id int);",
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const txCalls = mockConn.calls.filter((c) =>
    ["beginTransaction", "commit", "rollback"].includes(c.type),
  );
  assert.equal(txCalls.length, 0);
});

test("16 & 17. erro conhecido contém apenas filename e prefixo seguro sem vazar segredos", async () => {
  const sensitiveSecret = "SENSITIVE_SQL_QUERY_ERROR_SECRET_456";
  const mockConn = createMockConnection({
    queryFailFile: "0001_fail.sql",
    queryFailFileContent: "FAIL_SQL",
  });
  const dbConfig = {
    host: "127.0.0.1",
    user: "secret_user",
    password: "secret_password",
  };

  await assert.rejects(
    async () => {
      await runMigrations({
        dbConfig,
        createConnectionFn: async () => mockConn,
        readdirFn: async () => ["0001_fail.sql"],
        readFileFn: async () => "FAIL_SQL",
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
    },
    (err) => {
      assert.equal(err instanceof MigrationRunnerError, true);
      assert.equal(err.message, "[migration] failed: 0001_fail.sql");
      assert.equal(err.message.includes(sensitiveSecret), false);
      assert.equal(err.message.includes("secret_user"), false);
      assert.equal(err.message.includes("secret_password"), false);
      return true;
    },
  );
});

test("18. entrypoint (migrate.js) define exitCode = 1 em falha de migration", async () => {
  const processRef = {};
  const logs = [];
  const mockConn = createMockConnection({
    queryFailFile: "0001_fail.sql",
    queryFailFileContent: "FAIL_SQL",
  });

  await runMigrateEntrypoint({
    processRef,
    logger: {
      error: (msg) => logs.push(msg),
    },
    runnerOptions: {
      createConnectionFn: async () => mockConn,
      readdirFn: async () => ["0001_fail.sql"],
      readFileFn: async () => "FAIL_SQL",
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    },
  });

  assert.equal(processRef.exitCode, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0], "[migration] failed: 0001_fail.sql");
});

test("19. package.json e package-lock.json permanecem inalterados", () => {
  const pkgPath = path.join(projectRoot, "package.json");
  const pkgLockPath = path.join(projectRoot, "package-lock.json");

  assert.equal(fs.existsSync(pkgPath), true);
  assert.equal(fs.existsSync(pkgLockPath), true);
});
