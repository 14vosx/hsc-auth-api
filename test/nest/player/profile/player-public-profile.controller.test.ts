import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
  RequestMethod,
} from "@nestjs/common";
import {
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";

import {
  PlayerPublicProfileController,
} from "../../../../src/nest/player/profile/player-public-profile.controller.js";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: "Player bio",
  avatarUrl: null,
  bannerUrl: null,
  discordHandle: null,
  preferredRole: "awper",
  preferredMap: "de_mirage",
  joinedAt: "2026-08-07 18:00:00",
};

test("PlayerPublicProfileController - registra GET /player/profiles/:slug", () => {
  const controllerPath =
    Reflect.getMetadata(
      PATH_METADATA,
      PlayerPublicProfileController,
    ) as string;
  const handler =
    PlayerPublicProfileController
      .prototype.getBySlug;
  const methodPath =
    Reflect.getMetadata(
      PATH_METADATA,
      handler,
    ) as string;
  const requestMethod =
    Reflect.getMetadata(
      METHOD_METADATA,
      handler,
    ) as RequestMethod;

  assert.equal(
    requestMethod,
    RequestMethod.GET,
  );
  assert.equal(
    `/${controllerPath}/${methodPath}`,
    "/player/profiles/:slug",
  );
});

test("PlayerPublicProfileController - retorna somente profile público", async () => {
  const controller =
    new PlayerPublicProfileController({
      async getPublicProfileBySlug() {
        return {
          ok: true,
          profile: PROFILE,
        };
      },
    });

  assert.deepEqual(
    await controller.getBySlug("lavos"),
    {
      ok: true,
      profile: PROFILE,
    },
  );

  assert.equal(
    "playerAccountId" in PROFILE,
    false,
  );

  assert.equal(
    "id" in PROFILE,
    false,
  );

  assert.equal(
    "visibility" in PROFILE,
    false,
  );
});

test("PlayerPublicProfileController - private, missing e slug inválido recebem 404 uniforme", async () => {
  const controller =
    new PlayerPublicProfileController({
      async getPublicProfileBySlug() {
        return {
          ok: false,
          error: "player_not_found",
        };
      },
    });

  await assert.rejects(
    controller.getBySlug(
      "hidden-player",
    ),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      const httpError =
        error as HttpException;

      assert.equal(
        httpError.getStatus(),
        HttpStatus.NOT_FOUND,
      );

      assert.deepEqual(
        httpError.getResponse(),
        {
          ok: false,
          error: "player_not_found",
        },
      );

      return true;
    },
  );
});

test("PlayerPublicProfileController - falha inesperada de leitura retorna 500 sanitizado", async () => {
  const controller =
    new PlayerPublicProfileController({
      async getPublicProfileBySlug() {
        throw new Error(
          "database secret details",
        );
      },
    });

  await assert.rejects(
    controller.getBySlug("lavos"),
    (error: unknown) => {
      assert.equal(
        error instanceof HttpException,
        true,
      );

      const httpError =
        error as HttpException;

      assert.equal(
        httpError.getStatus(),
        HttpStatus
          .INTERNAL_SERVER_ERROR,
      );

      assert.deepEqual(
        httpError.getResponse(),
        {
          ok: false,
          error:
            "player_profile_read_failed",
        },
      );

      return true;
    },
  );
});
