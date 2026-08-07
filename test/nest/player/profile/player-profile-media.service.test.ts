import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerProfileMediaService,
} from "../../../../src/nest/player/profile/player-profile-media.service.js";

const ACCOUNT_ID =
  "01234567-89ab-cdef-0123-456789abcdef";

const OLD_AVATAR =
  "https://auth-api.haxixesmokeclub.com/uploads/player-avatar-20260807T170000000Z-0123456789abcdef.png";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: null,
  avatarUrl:
    "https://auth-api.haxixesmokeclub.com/uploads/player-avatar-new.png",
  bannerUrl: null,
  discordHandle: null,
  preferredRole: "awper",
  preferredMap: "de_mirage",
  visibility: "private" as const,
  joinedAt:
    "2026-08-07 18:00:00",
  createdAt:
    "2026-08-07 18:00:00",
  updatedAt:
    "2026-08-07 18:00:00",
};

const CONFIG = {
  uploads: {
    uploadDir:
      "/tmp/hsc-profile-media",
    publicPath:
      "/uploads",
    publicBaseUrl:
      "https://auth-api.haxixesmokeclub.com",
    maxBytes: 2 * 1024 * 1024,
  },
} as AppConfig;

function pngFile() {
  return {
    originalname: "avatar.png",
    mimetype: "image/png",
    size: 8,
    buffer: Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]),
  };
}

test("PlayerProfileMediaService - upload persiste URL e limpa mídia anterior após sucesso", async () => {
  const calls: string[] = [];
  let persistedUrl = "";

  const repository = {
    async updateMediaForAccount(
      playerAccountId: string,
      mediaKind: string,
      mediaUrl: string | null,
    ) {
      calls.push(
        `db:${mediaKind}`,
      );

      assert.equal(
        playerAccountId,
        ACCOUNT_ID,
      );

      assert.equal(
        mediaKind,
        "avatar",
      );

      assert.equal(
        typeof mediaUrl,
        "string",
      );

      persistedUrl =
        mediaUrl ?? "";

      return {
        ok: true as const,
        profile: {
          ...PROFILE,
          avatarUrl:
            mediaUrl,
        },
        previousMediaUrl:
          OLD_AVATAR,
      };
    },
  };

  const storage = {
    async saveFile(input: {
      uploadDir: string;
      filename: string;
      buffer: Buffer;
    }) {
      calls.push("save");

      assert.equal(
        input.uploadDir,
        CONFIG.uploads.uploadDir,
      );

      assert.match(
        input.filename,
        /^player-avatar-/,
      );

      return (
        `${input.uploadDir}/` +
        input.filename
      );
    },

    async removeFile() {
      calls.push("remove-new");
    },

    async removeManagedMediaUrl(
      _config: unknown,
      mediaUrl: string | null,
    ) {
      calls.push("remove-old");

      assert.equal(
        mediaUrl,
        OLD_AVATAR,
      );
    },
  };

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      repository,
      storage,
    );

  const result =
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      pngFile(),
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail(
      "expected upload success",
    );
  }

  assert.match(
    persistedUrl,
    /^https:\/\/auth-api\.haxixesmokeclub\.com\/uploads\/player-avatar-/,
  );

  assert.deepEqual(
    calls,
    [
      "save",
      "db:avatar",
      "remove-old",
    ],
  );
});

test("PlayerProfileMediaService - assinatura inválida não grava nem alcança DB", async () => {
  let repositoryCalled = false;
  let storageCalled = false;

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount() {
          repositoryCalled = true;
          throw new Error(
            "unexpected",
          );
        },
      },
      {
        async saveFile() {
          storageCalled = true;
          throw new Error(
            "unexpected",
          );
        },

        async removeFile() {},

        async removeManagedMediaUrl() {},
      },
    );

  assert.deepEqual(
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      {
        originalname:
          "avatar.png",
        mimetype:
          "image/png",
        size: 4,
        buffer:
          Buffer.from(
            "nope",
          ),
      },
    ),
    {
      ok: false,
      error:
        "invalid_file_signature",
    },
  );

  assert.equal(
    repositoryCalled,
    false,
  );

  assert.equal(
    storageCalled,
    false,
  );
});

test("PlayerProfileMediaService - MIME declarado diferente da assinatura é rejeitado", async () => {
  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount() {
          throw new Error(
            "unexpected",
          );
        },
      },
      {
        async saveFile() {
          throw new Error(
            "unexpected",
          );
        },

        async removeFile() {},

        async removeManagedMediaUrl() {},
      },
    );

  assert.deepEqual(
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      {
        ...pngFile(),
        originalname:
          "avatar.jpg",
        mimetype:
          "image/jpeg",
      },
    ),
    {
      ok: false,
      error:
        "file_type_mismatch",
    },
  );
});

test("PlayerProfileMediaService - limite é validado defensivamente antes do filesystem", async () => {
  let storageCalled = false;

  const service =
    new PlayerProfileMediaService(
      {
        ...CONFIG,
        uploads: {
          ...CONFIG.uploads,
          maxBytes: 4,
        },
      } as AppConfig,
      {
        async updateMediaForAccount() {
          throw new Error(
            "unexpected",
          );
        },
      },
      {
        async saveFile() {
          storageCalled = true;
          throw new Error(
            "unexpected",
          );
        },

        async removeFile() {},

        async removeManagedMediaUrl() {},
      },
    );

  assert.deepEqual(
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      pngFile(),
    ),
    {
      ok: false,
      error: "file_too_large",
    },
  );

  assert.equal(
    storageCalled,
    false,
  );
});

test("PlayerProfileMediaService - erro de domínio do DB remove arquivo recém-gravado", async () => {
  const removed: string[] = [];

  const storage = {
    async saveFile(input: {
      uploadDir: string;
      filename: string;
    }) {
      return (
        `${input.uploadDir}/` +
        input.filename
      );
    },

    async removeFile(
      filePath: string,
    ) {
      removed.push(
        filePath,
      );
    },

    async removeManagedMediaUrl() {
      throw new Error(
        "old media must not be touched",
      );
    },
  };

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount() {
          return {
            ok: false as const,
            error:
              "player_account_disabled" as const,
          };
        },
      },
      storage,
    );

  assert.deepEqual(
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      pngFile(),
    ),
    {
      ok: false,
      error:
        "player_account_disabled",
    },
  );

  assert.equal(
    removed.length,
    1,
  );

  assert.match(
    removed[0],
    /player-avatar-/,
  );
});

test("PlayerProfileMediaService - exceção do DB compensa removendo novo arquivo", async () => {
  const calls: string[] = [];

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount() {
          calls.push("db");

          throw new Error(
            "simulated_db_failure",
          );
        },
      },
      {
        async saveFile(input: {
          uploadDir: string;
          filename: string;
        }) {
          calls.push("save");

          return (
            `${input.uploadDir}/` +
            input.filename
          );
        },

        async removeFile() {
          calls.push(
            "remove-new",
          );
        },

        async removeManagedMediaUrl() {
          calls.push(
            "remove-old",
          );
        },
      },
    );

  await assert.rejects(
    service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      pngFile(),
    ),
    /simulated_db_failure/,
  );

  assert.deepEqual(
    calls,
    [
      "save",
      "db",
      "remove-new",
    ],
  );
});

test("PlayerProfileMediaService - remoção limpa DB antes do arquivo físico", async () => {
  const calls: string[] = [];

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount(
          _playerAccountId: string,
          mediaKind: string,
          mediaUrl: string | null,
        ) {
          calls.push("db");

          assert.equal(
            mediaKind,
            "banner",
          );

          assert.equal(
            mediaUrl,
            null,
          );

          return {
            ok: true as const,
            profile: {
              ...PROFILE,
              bannerUrl: null,
            },
            previousMediaUrl:
              OLD_AVATAR,
          };
        },
      },
      {
        async saveFile() {
          throw new Error(
            "unexpected",
          );
        },

        async removeFile() {},

        async removeManagedMediaUrl(
          _config: unknown,
          mediaUrl: string | null,
        ) {
          calls.push(
            "remove-old",
          );

          assert.equal(
            mediaUrl,
            OLD_AVATAR,
          );
        },
      },
    );

  const result =
    await service.removeMedia(
      ACCOUNT_ID,
      "banner",
    );

  assert.equal(
    result.ok,
    true,
  );

  assert.deepEqual(
    calls,
    [
      "db",
      "remove-old",
    ],
  );
});

test("PlayerProfileMediaService - mídia animada é rejeitada antes de filesystem e DB", async () => {
  let repositoryCalled = false;
  let storageCalled = false;

  const service =
    new PlayerProfileMediaService(
      CONFIG,
      {
        async updateMediaForAccount() {
          repositoryCalled = true;

          throw new Error(
            "unexpected",
          );
        },
      },
      {
        async saveFile() {
          storageCalled = true;

          throw new Error(
            "unexpected",
          );
        },

        async removeFile() {},

        async removeManagedMediaUrl() {},
      },
    );

  const pngSignature =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  const actlChunk =
    Buffer.alloc(20);

  actlChunk.writeUInt32BE(
    8,
    0,
  );

  actlChunk.write(
    "acTL",
    4,
    "ascii",
  );

  const result =
    await service.uploadMedia(
      ACCOUNT_ID,
      "avatar",
      {
        originalname:
          "animated.png",
        mimetype:
          "image/png",
        buffer:
          Buffer.concat([
            pngSignature,
            actlChunk,
          ]),
        size:
          pngSignature.length +
          actlChunk.length,
      },
    );

  assert.deepEqual(
    result,
    {
      ok: false,
      error:
        "invalid_file_type",
    },
  );

  assert.equal(
    storageCalled,
    false,
  );

  assert.equal(
    repositoryCalled,
    false,
  );
});
