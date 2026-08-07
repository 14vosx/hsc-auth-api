import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerProfileController,
  type PlayerProfileServicePort,
} from "../../../../src/nest/player/profile/player-profile.controller.js";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: null,
  avatarUrl: null,
  bannerUrl: null,
  discordHandle: null,
  preferredRole: "awper",
  preferredMap: "de_mirage",
  visibility: "private" as const,
  joinedAt: "2026-08-07 18:00:00",
  createdAt: "2026-08-07 18:00:00",
  updatedAt: "2026-08-07 18:00:00",
};

function makePlayer(
  playerAccountId: string | null,
) {
  return {
    via: "session" as const,
    sessionId: "session-id",
    playerAccountId,
    steamid64: null,
    displayName: null,
    avatarMedium: null,
    steamProfileUrl: null,
    expiresAt: null,
  };
}

test("PlayerProfileController - GET /me usa somente playerAccountId da sessão", async () => {
  let receivedPlayerAccountId = "";

  const service:
    PlayerProfileServicePort = {
      async getMyProfile(
        playerAccountId,
      ) {
        receivedPlayerAccountId =
          playerAccountId;

        return {
          ok: true,
          profile: PROFILE,
          created: false,
        };
      },

      async updateMyProfile() {
        throw new Error("unexpected");
      },
    };

  const controller =
    new PlayerProfileController(service);

  const result =
    await controller.getMe({
      player: makePlayer("account-id"),
    });

  assert.equal(
    receivedPlayerAccountId,
    "account-id",
  );

  assert.deepEqual(result, {
    ok: true,
    profile: PROFILE,
  });

  assert.equal(
    "playerAccountId" in result.profile,
    false,
  );

  assert.equal(
    "id" in result.profile,
    false,
  );
});

test("PlayerProfileController - sessão sem playerAccountId é rejeitada", async () => {
  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        throw new Error("unexpected");
      },

      async updateMyProfile() {
        throw new Error("unexpected");
      },
    });

  await assert.rejects(
    controller.getMe({
      player: makePlayer(null),
    }),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      assert.equal(
        (error as HttpException).getStatus(),
        HttpStatus.UNAUTHORIZED,
      );

      return true;
    },
  );
});

test("PlayerProfileController - conta disabled é rejeitada mesmo após autenticação", async () => {
  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        return {
          ok: false,
          error: "player_account_disabled",
        };
      },

      async updateMyProfile() {
        throw new Error("unexpected");
      },
    });

  await assert.rejects(
    controller.getMe({
      player: makePlayer("account-id"),
    }),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      assert.equal(
        (error as HttpException).getStatus(),
        HttpStatus.FORBIDDEN,
      );

      return true;
    },
  );
});

test("PlayerProfileController - PATCH usa conta da sessão e retorna perfil atualizado", async () => {
  let receivedAccountId = "";
  let receivedBody: unknown = null;

  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        throw new Error("unexpected");
      },

      async updateMyProfile(
        playerAccountId,
        body,
      ) {
        receivedAccountId =
          playerAccountId;

        receivedBody = body;

        return {
          ok: true,
          profile: {
            ...PROFILE,
            displayName: "Novo Nome",
          },
        };
      },
    });

  const body = {
    displayName: "Novo Nome",
    playerAccountId:
      "attacker-controlled-id",
  };

  const result =
    await controller.updateMe(
      {
        player: makePlayer("account-id"),
      },
      body,
    );

  assert.equal(
    receivedAccountId,
    "account-id",
  );

  assert.equal(
    receivedBody,
    body,
  );

  assert.deepEqual(
    result.profile.displayName,
    "Novo Nome",
  );
});

test("PlayerProfileController - validação inválida retorna 400", async () => {
  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        throw new Error("unexpected");
      },

      async updateMyProfile() {
        return {
          ok: false,
          error: "invalid_preferred_map",
        };
      },
    });

  await assert.rejects(
    controller.updateMe(
      {
        player: makePlayer("account-id"),
      },
      {
        preferredMap: "de_unknown",
      },
    ),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      assert.equal(
        (error as HttpException).getStatus(),
        HttpStatus.BAD_REQUEST,
      );

      return true;
    },
  );
});

test("PlayerProfileController - slug indisponível retorna 409", async () => {
  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        throw new Error("unexpected");
      },

      async updateMyProfile() {
        return {
          ok: false,
          error: "slug_unavailable",
        };
      },
    });

  await assert.rejects(
    controller.updateMe(
      {
        player: makePlayer("account-id"),
      },
      {
        slug: "already-used",
      },
    ),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      assert.equal(
        (error as HttpException).getStatus(),
        HttpStatus.CONFLICT,
      );

      return true;
    },
  );
});

test("PlayerProfileController - conta disabled no PATCH retorna 403", async () => {
  const controller =
    new PlayerProfileController({
      async getMyProfile() {
        throw new Error("unexpected");
      },

      async updateMyProfile() {
        return {
          ok: false,
          error: "player_account_disabled",
        };
      },
    });

  await assert.rejects(
    controller.updateMe(
      {
        player: makePlayer("account-id"),
      },
      {
        bio: "blocked",
      },
    ),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      assert.equal(
        (error as HttpException).getStatus(),
        HttpStatus.FORBIDDEN,
      );

      return true;
    },
  );
});
