import test from "node:test";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerProfileRepository,
} from "../../../../src/nest/player/profile/player-profile.repository.js";

const ACCOUNT_ID =
  "01234567-89ab-cdef-0123-456789abcdef";

const PROFILE_ROW = {
  display_name: "Lavos",
  slug: "lavos",
  bio: null,
  avatar_url: null,
  banner_url: null,
  discord_handle: null,
  preferred_role: "awper",
  preferred_map: "de_mirage",
  visibility: "private",
  joined_at: "2026-08-07 18:00:00",
  created_at: "2026-08-07 18:00:00",
  updated_at: "2026-08-07 18:00:00",
};

test("PlayerProfileRepository - perfil existente é retornado sem INSERT", async () => {
  const sql: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute(statement: string) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Conta",
        }]];
      }

      return [[PROFILE_ROW]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  const result =
    await repository.ensureProfileForAccount(
      ACCOUNT_ID,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(result.created, false);
  assert.equal(result.profile.slug, "lavos");

  assert.equal(sql.length, 2);
  assert.match(sql[0], /FOR UPDATE$/);
  assert.match(sql[1], /FOR UPDATE$/);

  assert.equal(
    sql.some((statement) =>
      statement.includes(
        "INSERT INTO player_profiles",
      ),
    ),
    false,
  );
});

test("PlayerProfileRepository - conta legada cria perfil mínimo privado", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  const params: unknown[][] = [];
  let count = 0;

  const createdRow = {
    ...PROFILE_ROW,
    display_name: "Jogador HSC",
    slug:
      "player-0123456789abcdef0123456789abcdef",
    preferred_role: null,
    preferred_map: null,
  };

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      statement: string,
      values?: unknown[],
    ) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);
      params.push(values ?? []);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: null,
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      if (count === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      return [[createdRow]];
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  const result =
    await repository.ensureProfileForAccount(
      ACCOUNT_ID,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(result.created, true);
  assert.equal(
    result.profile.displayName,
    "Jogador HSC",
  );
  assert.equal(
    result.profile.slug,
    "player-0123456789abcdef0123456789abcdef",
  );
  assert.equal(
    result.profile.visibility,
    "private",
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 4);

  assert.match(
    sql[2],
    /INSERT INTO player_profiles/,
  );

  assert.equal(
    params[2][2],
    "Jogador HSC",
  );

  assert.equal(
    params[2][3],
    "player-0123456789abcdef0123456789abcdef",
  );
});

test("PlayerProfileRepository - nome existente da conta inicializa displayName", async () => {
  let count = 0;

  const createdRow = {
    ...PROFILE_ROW,
    display_name: "Player Original",
    slug:
      "player-0123456789abcdef0123456789abcdef",
  };

  const connection = {
    async beginTransaction() {},

    async execute(
      _statement: string,
      values?: unknown[],
    ) {
      count += 1;

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "  Player Original  ",
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      if (count === 3) {
        assert.equal(
          values?.[2],
          "Player Original",
        );

        return [{
          affectedRows: 1,
        }];
      }

      return [[createdRow]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  const result =
    await repository.ensureProfileForAccount(
      ACCOUNT_ID,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(
    result.profile.displayName,
    "Player Original",
  );
});

test("PlayerProfileRepository - conta disabled não recebe perfil", async () => {
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      count += 1;

      return [[{
        id: ACCOUNT_ID,
        status: "disabled",
        display_name: null,
      }]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.ensureProfileForAccount(
      ACCOUNT_ID,
    ),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );

  assert.equal(count, 1);
});

test("PlayerProfileRepository - falha após INSERT faz rollback", async () => {
  const calls: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      count += 1;

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: null,
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      if (count === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      throw new Error("read-after-insert-failed");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  await assert.rejects(
    repository.ensureProfileForAccount(
      ACCOUNT_ID,
    ),
    /read-after-insert-failed/,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});

test("PlayerProfileRepository - PATCH atualiza somente colunas permitidas com parâmetros", async () => {
  const calls: string[] = [];
  const statements: string[] = [];
  const parameters: unknown[][] = [];
  let count = 0;

  const updatedRow = {
    ...PROFILE_ROW,
    display_name: "Novo Nome",
    slug: "novo-slug",
    visibility: "public",
  };

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      statement: string,
      values?: unknown[],
    ) {
      count += 1;

      statements.push(
        statement.replace(/\s+/g, " ").trim(),
      );
      parameters.push(values ?? []);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Conta",
        }]];
      }

      if (count === 2) {
        return [[PROFILE_ROW]];
      }

      if (count === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      return [[updatedRow]];
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  const result =
    await repository.updateProfileForAccount(
      ACCOUNT_ID,
      {
        displayName: "Novo Nome",
        slug: "novo-slug",
        visibility: "public",
      },
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected update success");
  }

  assert.equal(
    result.profile.displayName,
    "Novo Nome",
  );
  assert.equal(
    result.profile.slug,
    "novo-slug",
  );
  assert.equal(
    result.profile.visibility,
    "public",
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(statements.length, 4);

  assert.match(
    statements[0],
    /FROM player_accounts[\s\S]*FOR UPDATE$/,
  );

  assert.match(
    statements[1],
    /FROM player_profiles[\s\S]*FOR UPDATE$/,
  );

  assert.equal(
    statements[2].includes(
      "display_name = ?",
    ),
    true,
  );
  assert.equal(
    statements[2].includes("slug = ?"),
    true,
  );
  assert.equal(
    statements[2].includes(
      "visibility = ?",
    ),
    true,
  );

  assert.deepEqual(
    parameters[2],
    [
      "Novo Nome",
      "novo-slug",
      "public",
      ACCOUNT_ID,
    ],
  );
});

test("PlayerProfileRepository - PATCH de conta legada cria perfil mínimo antes da alteração", async () => {
  const statements: string[] = [];
  const parameters: unknown[][] = [];
  let count = 0;

  const updatedRow = {
    ...PROFILE_ROW,
    display_name: "Novo Nome",
    slug:
      "player-0123456789abcdef0123456789abcdef",
    preferred_role: null,
    preferred_map: null,
  };

  const connection = {
    async beginTransaction() {},

    async execute(
      statement: string,
      values?: unknown[],
    ) {
      count += 1;

      statements.push(
        statement.replace(/\s+/g, " ").trim(),
      );
      parameters.push(values ?? []);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: null,
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      if (count === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      if (count === 4) {
        return [{
          affectedRows: 1,
        }];
      }

      return [[updatedRow]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  const result =
    await repository.updateProfileForAccount(
      ACCOUNT_ID,
      {
        displayName: "Novo Nome",
      },
    );

  assert.equal(result.ok, true);

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "INSERT INTO player_profiles",
      ),
    ),
    true,
  );

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "UPDATE player_profiles",
      ),
    ),
    true,
  );

  const insertIndex =
    statements.findIndex((statement) =>
      statement.includes(
        "INSERT INTO player_profiles",
      ),
    );

  assert.equal(
    parameters[insertIndex][2],
    "Jogador HSC",
  );

  assert.equal(
    parameters[insertIndex][3],
    "player-0123456789abcdef0123456789abcdef",
  );
});

test("PlayerProfileRepository - conta desabilitada não pode ser alterada", async () => {
  const statements: string[] = [];

  const connection = {
    async beginTransaction() {},

    async execute(statement: string) {
      statements.push(
        statement.replace(/\s+/g, " ").trim(),
      );

      return [[{
        id: ACCOUNT_ID,
        status: "disabled",
        display_name: null,
      }]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.updateProfileForAccount(
      ACCOUNT_ID,
      {
        displayName: "Blocked",
      },
    ),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );

  assert.equal(
    statements.length,
    1,
  );

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "UPDATE player_profiles",
      ),
    ),
    false,
  );
});

test("PlayerProfileRepository - conflito UNIQUE de slug faz rollback e retorna slug_unavailable", async () => {
  const calls: string[] = [];
  let count = 0;

  const duplicateError =
    Object.assign(
      new Error("duplicate"),
      {
        code: "ER_DUP_ENTRY",
      },
    );

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      count += 1;

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Conta",
        }]];
      }

      if (count === 2) {
        return [[PROFILE_ROW]];
      }

      if (
        statement.includes(
          "UPDATE player_profiles",
        )
      ) {
        throw duplicateError;
      }

      throw new Error("unexpected query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.updateProfileForAccount(
      ACCOUNT_ID,
      {
        slug: "already-used",
      },
    ),
    {
      ok: false,
      error: "slug_unavailable",
    },
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});

test("PlayerProfileRepository - perfil não pode ser publicado mantendo slug técnico", async () => {
  const calls: string[] = [];
  let executeCount = 0;

  const technicalProfile = {
    ...PROFILE_ROW,
    slug:
      "player-0123456789abcdef0123456789abcdef",
    visibility: "private" as const,
  };

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      executeCount += 1;

      if (executeCount === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Conta",
        }]];
      }

      if (executeCount === 2) {
        return [[technicalProfile]];
      }

      throw new Error(
        "unexpected_execute",
      );
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerProfileRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.updateProfileForAccount(
      ACCOUNT_ID,
      {
        visibility: "public",
      },
    ),
    {
      ok: false,
      error:
        "public_profile_requires_custom_slug",
    },
  );

  assert.equal(
    executeCount,
    2,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});
