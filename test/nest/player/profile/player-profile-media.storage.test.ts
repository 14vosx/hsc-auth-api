import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  join,
} from "node:path";
import {
  tmpdir,
} from "node:os";

import {
  PlayerProfileMediaStorage,
  createPlayerProfileMediaFilename,
  isManagedPlayerProfileMediaFilename,
  resolveManagedPlayerProfileMediaFilePath,
} from "../../../../src/nest/player/profile/player-profile-media.storage.js";

const CONFIG = {
  uploadDir:
    "/var/lib/hsc-test/uploads",
  publicBaseUrl:
    "https://auth-api.haxixesmokeclub.com",
  publicPath:
    "/uploads",
};

const AVATAR_FILENAME =
  "player-avatar-20260807T180000000Z-0123456789abcdef.png";

const BANNER_FILENAME =
  "player-banner-20260807T180000000Z-fedcba9876543210.webp";

test("player media storage - gera filename namespaced sem nome fornecido pelo cliente", () => {
  const filename =
    createPlayerProfileMediaFilename(
      "avatar",
      {
        mimetype: "image/png",
        originalname:
          "../../my-photo.png",
      },
      new Date(
        "2026-08-07T18:00:00.000Z",
      ),
    );

  assert.notEqual(
    filename,
    null,
  );

  assert.match(
    filename ?? "",
    /^player-avatar-20260807T180000000Z-[0-9a-f]{16}\.png$/,
  );

  assert.equal(
    filename?.includes(
      "my-photo",
    ),
    false,
  );
});

test("player media storage - reconhece somente namespaces avatar e banner válidos", () => {
  assert.equal(
    isManagedPlayerProfileMediaFilename(
      AVATAR_FILENAME,
    ),
    true,
  );

  assert.equal(
    isManagedPlayerProfileMediaFilename(
      BANNER_FILENAME,
    ),
    true,
  );

  assert.equal(
    isManagedPlayerProfileMediaFilename(
      "20260807T180000000Z-0123456789abcdef.png",
    ),
    false,
  );

  assert.equal(
    isManagedPlayerProfileMediaFilename(
      "admin-image.png",
    ),
    false,
  );
});

test("player media storage - resolve somente URL do storage HSC e namespace Player", () => {
  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      `https://auth-api.haxixesmokeclub.com/uploads/${AVATAR_FILENAME}`,
    ),
    join(
      CONFIG.uploadDir,
      AVATAR_FILENAME,
    ),
  );

  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      `https://cdn.example.com/uploads/${AVATAR_FILENAME}`,
    ),
    null,
  );

  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      "https://auth-api.haxixesmokeclub.com/uploads/admin-image.png",
    ),
    null,
  );
});

test("player media storage - rejeita traversal, subpaths, query e fragment", () => {
  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      "https://auth-api.haxixesmokeclub.com/uploads/%2E%2E%2Fsecret.png",
    ),
    null,
  );

  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      `https://auth-api.haxixesmokeclub.com/uploads/subdir/${AVATAR_FILENAME}`,
    ),
    null,
  );

  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      `https://auth-api.haxixesmokeclub.com/uploads/${AVATAR_FILENAME}?download=1`,
    ),
    null,
  );

  assert.equal(
    resolveManagedPlayerProfileMediaFilePath(
      CONFIG,
      `https://auth-api.haxixesmokeclub.com/uploads/${AVATAR_FILENAME}#fragment`,
    ),
    null,
  );
});

test("player media storage - grava arquivo somente com filename Player gerenciado", async () => {
  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        "hsc-player-media-",
      ),
    );

  try {
    const storage =
      new PlayerProfileMediaStorage();

    const filePath =
      await storage.saveFile({
        uploadDir: dir,
        filename:
          AVATAR_FILENAME,
        buffer:
          Buffer.from(
            "image-bytes",
          ),
      });

    assert.equal(
      await readFile(
        filePath,
        "utf8",
      ),
      "image-bytes",
    );

    await assert.rejects(
      storage.saveFile({
        uploadDir: dir,
        filename:
          "admin-image.png",
        buffer:
          Buffer.from(
            "should-not-write",
          ),
      }),
      /invalid_player_profile_media_filename/,
    );
  } finally {
    await rm(
      dir,
      {
        recursive: true,
        force: true,
      },
    );
  }
});

test("player media storage - write exclusivo impede sobrescrever arquivo existente", async () => {
  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        "hsc-player-media-",
      ),
    );

  try {
    const storage =
      new PlayerProfileMediaStorage();

    await storage.saveFile({
      uploadDir: dir,
      filename:
        AVATAR_FILENAME,
      buffer:
        Buffer.from("first"),
    });

    await assert.rejects(
      storage.saveFile({
        uploadDir: dir,
        filename:
          AVATAR_FILENAME,
        buffer:
          Buffer.from("second"),
      }),
    );

    assert.equal(
      await readFile(
        join(
          dir,
          AVATAR_FILENAME,
        ),
        "utf8",
      ),
      "first",
    );
  } finally {
    await rm(
      dir,
      {
        recursive: true,
        force: true,
      },
    );
  }
});

test("player media storage - cleanup remove somente URL Player gerenciada", async () => {
  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        "hsc-player-media-",
      ),
    );

  try {
    const config = {
      ...CONFIG,
      uploadDir: dir,
    };

    const storage =
      new PlayerProfileMediaStorage();

    const managedPath =
      join(
        dir,
        AVATAR_FILENAME,
      );

    const unrelatedPath =
      join(
        dir,
        "legacy-avatar.png",
      );

    await writeFile(
      managedPath,
      "managed",
    );

    await writeFile(
      unrelatedPath,
      "legacy",
    );

    await storage.removeManagedMediaUrl(
      config,
      `https://cdn.example.com/uploads/${AVATAR_FILENAME}`,
    );

    assert.equal(
      await storage.fileExists(
        managedPath,
      ),
      true,
    );

    await storage.removeManagedMediaUrl(
      config,
      "https://auth-api.haxixesmokeclub.com/uploads/legacy-avatar.png",
    );

    assert.equal(
      await storage.fileExists(
        unrelatedPath,
      ),
      true,
    );

    await storage.removeManagedMediaUrl(
      config,
      `https://auth-api.haxixesmokeclub.com/uploads/${AVATAR_FILENAME}`,
    );

    assert.equal(
      await storage.fileExists(
        managedPath,
      ),
      false,
    );

    assert.equal(
      await storage.fileExists(
        unrelatedPath,
      ),
      true,
    );
  } finally {
    await rm(
      dir,
      {
        recursive: true,
        force: true,
      },
    );
  }
});
