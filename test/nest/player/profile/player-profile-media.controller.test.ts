import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpException,
} from "@nestjs/common";

import {
  PlayerProfileMediaController,
} from "../../../../src/nest/player/profile/player-profile-media.controller.js";

const ACCOUNT_ID =
  "01234567-89ab-cdef-0123-456789abcdef";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: null,
  avatarUrl:
    "https://auth-api.haxixesmokeclub.com/uploads/player-avatar-test.png",
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

const FILE = {
  originalname:
    "avatar.png",
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

function request() {
  return {
    player: {
      playerAccountId:
        ACCOUNT_ID,
    },
  };
}

async function expectHttpError(
  action: () => Promise<unknown>,
  status: number,
  error: string,
) {
  try {
    await action();

    assert.fail(
      "expected HttpException",
    );
  } catch (caught) {
    assert.equal(
      caught instanceof
        HttpException,
      true,
    );

    const exception =
      caught as HttpException;

    assert.equal(
      exception.getStatus(),
      status,
    );

    assert.deepEqual(
      exception.getResponse(),
      {
        ok: false,
        error,
      },
    );
  }
}

test("PlayerProfileMediaController - upload avatar usa somente conta autenticada", async () => {
  let receivedAccountId = "";
  let receivedKind = "";

  const controller =
    new PlayerProfileMediaController({
      async uploadMedia(
        playerAccountId,
        mediaKind,
      ) {
        receivedAccountId =
          playerAccountId;

        receivedKind =
          mediaKind;

        return {
          ok: true,
          profile: PROFILE,
        };
      },

      async removeMedia() {
        throw new Error(
          "unexpected",
        );
      },
    });

  const result =
    await controller
      .uploadAvatar(
        request(),
        FILE,
      );

  assert.equal(
    receivedAccountId,
    ACCOUNT_ID,
  );

  assert.equal(
    receivedKind,
    "avatar",
  );

  assert.deepEqual(
    result,
    {
      ok: true,
      profile: PROFILE,
    },
  );
});

test("PlayerProfileMediaController - upload sem file retorna missing_file", async () => {
  const controller =
    new PlayerProfileMediaController({
      async uploadMedia() {
        throw new Error(
          "unexpected",
        );
      },

      async removeMedia() {
        throw new Error(
          "unexpected",
        );
      },
    });

  try {
    await controller
      .uploadAvatar(
        request(),
        undefined,
      );

    assert.fail(
      "expected missing_file",
    );
  } catch (caught) {
    const exception =
      caught as HttpException;

    assert.equal(
      exception.getStatus(),
      400,
    );

    assert.deepEqual(
      exception.getResponse(),
      {
        ok: false,
        error: "missing_file",
        field: "file",
      },
    );
  }
});

test("PlayerProfileMediaController - conta desabilitada vira 403", async () => {
  const controller =
    new PlayerProfileMediaController({
      async uploadMedia() {
        return {
          ok: false,
          error:
            "player_account_disabled",
        };
      },

      async removeMedia() {
        throw new Error(
          "unexpected",
        );
      },
    });

  await expectHttpError(
    () =>
      controller.uploadAvatar(
        request(),
        FILE,
      ),
    403,
    "player_account_disabled",
  );
});

test("PlayerProfileMediaController - conta inexistente não é exposta e vira invalid_session", async () => {
  const controller =
    new PlayerProfileMediaController({
      async uploadMedia() {
        return {
          ok: false,
          error:
            "player_account_not_found",
        };
      },

      async removeMedia() {
        throw new Error(
          "unexpected",
        );
      },
    });

  await expectHttpError(
    () =>
      controller.uploadAvatar(
        request(),
        FILE,
      ),
    401,
    "invalid_session",
  );
});

test("PlayerProfileMediaController - remove banner usa operação dedicada", async () => {
  let receivedKind = "";
  let receivedAccountId = "";

  const controller =
    new PlayerProfileMediaController({
      async uploadMedia() {
        throw new Error(
          "unexpected",
        );
      },

      async removeMedia(
        playerAccountId,
        mediaKind,
      ) {
        receivedAccountId =
          playerAccountId;

        receivedKind =
          mediaKind;

        return {
          ok: true,
          profile: {
            ...PROFILE,
            bannerUrl: null,
          },
        };
      },
    });

  const result =
    await controller
      .removeBanner(
        request(),
      );

  assert.equal(
    receivedAccountId,
    ACCOUNT_ID,
  );

  assert.equal(
    receivedKind,
    "banner",
  );

  assert.equal(
    result.ok,
    true,
  );
});

test("PlayerProfileMediaController - falha interna é sanitizada", async () => {
  const controller =
    new PlayerProfileMediaController({
      async uploadMedia() {
        throw new Error(
          "sensitive database detail",
        );
      },

      async removeMedia() {
        throw new Error(
          "unexpected",
        );
      },
    });

  await expectHttpError(
    () =>
      controller.uploadAvatar(
        request(),
        FILE,
      ),
    500,
    "player_profile_media_update_failed",
  );
});
