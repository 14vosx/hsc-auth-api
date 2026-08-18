import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerProfileRepository,
} from "../../../../src/nest/player/profile/player-profile.repository.js";

const ACCOUNT_ID =
  "01234567-89ab-cdef-0123-456789abcdef";

const OLD_AVATAR =
  "https://auth-api.haxixesmokeclub.com/uploads/old-avatar.png";

const NEW_AVATAR =
  "https://auth-api.haxixesmokeclub.com/uploads/new-avatar.webp";

const OLD_BANNER =
  "https://auth-api.haxixesmokeclub.com/uploads/old-banner.jpg";

const PROFILE_ROW = {
  display_name: "Lavos",
  slug: "lavos",
  bio: null,
  avatar_url: OLD_AVATAR,
  banner_url: OLD_BANNER,
  discord_handle: null,
  preferred_role: "awper",
  preferred_map: "de_mirage",
  visibility: "private",
  joined_at:
    "2026-08-07 18:00:00",
  created_at:
    "2026-08-07 18:00:00",
  updated_at:
    "2026-08-07 18:00:00",
};

function databaseWithConnection(
  connection: unknown,
): DatabaseService {
  return {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;
}

test("PlayerProfileRepository media - substitui avatar sob lock e retorna URL anterior", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  const params: unknown[][] = [];
  let count = 0;

  const updatedRow = {
    ...PROFILE_ROW,
    avatar_url: NEW_AVATAR,
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
        statement
          .replace(/\s+/g, " ")
          .trim();

      sql.push(normalized);
      params.push(values ?? []);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Lavos",
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

  const repository =
    new PlayerProfileRepository(
      databaseWithConnection(
        connection,
      ),
    );

  const result =
    await repository.updateMediaForAccount(
      ACCOUNT_ID,
      "avatar",
      NEW_AVATAR,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail(
      "expected media update success",
    );
  }

  assert.equal(
    result.previousMediaUrl,
    OLD_AVATAR,
  );

  assert.equal(
    result.profile.avatarUrl,
    NEW_AVATAR,
  );

  assert.equal(
    result.profile.bannerUrl,
    OLD_BANNER,
  );

  assert.match(
    sql[0],
    /FOR UPDATE$/,
  );

  assert.match(
    sql[1],
    /FOR UPDATE$/,
  );

  assert.match(
    sql[2],
    /SET avatar_url = \?/,
  );

  assert.equal(
    sql[2].includes(
      "banner_url = ?",
    ),
    false,
  );

  assert.deepEqual(
    params[2],
    [
      NEW_AVATAR,
      ACCOUNT_ID,
    ],
  );

  assert.deepEqual(
    calls,
    [
      "begin",
      "commit",
      "release",
    ],
  );
});

test("PlayerProfileRepository media - remove banner com NULL e retorna URL anterior", async () => {
  const params: unknown[][] = [];
  const sql: string[] = [];
  let count = 0;

  const updatedRow = {
    ...PROFILE_ROW,
    banner_url: null,
  };

  const connection = {
    async beginTransaction() {},

    async execute(
      statement: string,
      values?: unknown[],
    ) {
      count += 1;

      sql.push(
        statement
          .replace(/\s+/g, " ")
          .trim(),
      );

      params.push(values ?? []);

      if (count === 1) {
        return [[{
          id: ACCOUNT_ID,
          status: "active",
          display_name: "Lavos",
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

    async commit() {},
    async rollback() {},
    release() {},
  };

  const repository =
    new PlayerProfileRepository(
      databaseWithConnection(
        connection,
      ),
    );

  const result =
    await repository.updateMediaForAccount(
      ACCOUNT_ID,
      "banner",
      null,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail(
      "expected media delete success",
    );
  }

  assert.equal(
    result.previousMediaUrl,
    OLD_BANNER,
  );

  assert.equal(
    result.profile.bannerUrl,
    null,
  );

  assert.match(
    sql[2],
    /SET banner_url = \?/,
  );

  assert.deepEqual(
    params[2],
    [
      null,
      ACCOUNT_ID,
    ],
  );
});

test("PlayerProfileRepository media - conta legada cria profile privado antes de persistir media", async () => {
  const sql: string[] = [];
  const params: unknown[][] = [];
  let count = 0;

  const updatedRow = {
    ...PROFILE_ROW,
    display_name: "Jogador HSC",
    slug:
      "player-0123456789abcdef0123456789abcdef",
    avatar_url: NEW_AVATAR,
    banner_url: null,
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

      sql.push(
        statement
          .replace(/\s+/g, " ")
          .trim(),
      );

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

      if (
        count === 3 ||
        count === 4
      ) {
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

  const repository =
    new PlayerProfileRepository(
      databaseWithConnection(
        connection,
      ),
    );

  const result =
    await repository.updateMediaForAccount(
      ACCOUNT_ID,
      "avatar",
      NEW_AVATAR,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail(
      "expected legacy media success",
    );
  }

  assert.equal(
    result.previousMediaUrl,
    null,
  );

  assert.equal(
    result.profile.visibility,
    "private",
  );

  assert.equal(
    result.profile.slug,
    "player-0123456789abcdef0123456789abcdef",
  );

  assert.match(
    sql[2],
    /INSERT INTO player_profiles/,
  );

  assert.match(
    sql[3],
    /SET avatar_url = \?/,
  );

  assert.equal(
    params[2][2],
    "Jogador HSC",
  );
});

test("PlayerProfileRepository media - conta desabilitada não altera profile", async () => {
  const sql: string[] = [];
  const calls: string[] = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      statement: string,
    ) {
      sql.push(
        statement
          .replace(/\s+/g, " ")
          .trim(),
      );

      return [[{
        id: ACCOUNT_ID,
        status: "disabled",
        display_name: "Lavos",
      }]];
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

  const repository =
    new PlayerProfileRepository(
      databaseWithConnection(
        connection,
      ),
    );

  assert.deepEqual(
    await repository.updateMediaForAccount(
      ACCOUNT_ID,
      "avatar",
      NEW_AVATAR,
    ),
    {
      ok: false,
      error:
        "player_account_disabled",
    },
  );

  assert.equal(
    sql.length,
    1,
  );

  assert.equal(
    sql.some(
      (statement) =>
        statement.includes(
          "UPDATE player_profiles",
        ),
    ),
    false,
  );

  assert.deepEqual(
    calls,
    [
      "begin",
      "commit",
      "release",
    ],
  );
});

test("PlayerProfileRepository media - falha de persistência executa rollback", async () => {
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
          display_name: "Lavos",
        }]];
      }

      if (count === 2) {
        return [[PROFILE_ROW]];
      }

      throw new Error(
        "simulated_db_failure",
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

  const repository =
    new PlayerProfileRepository(
      databaseWithConnection(
        connection,
      ),
    );

  await assert.rejects(
    repository.updateMediaForAccount(
      ACCOUNT_ID,
      "avatar",
      NEW_AVATAR,
    ),
    /simulated_db_failure/,
  );

  assert.deepEqual(
    calls,
    [
      "begin",
      "rollback",
      "release",
    ],
  );
});
