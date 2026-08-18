import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  PLAYER_PROFILE_MAP_OPTIONS,
  PLAYER_PROFILE_ROLE_OPTIONS,
} from "../../../../src/nest/player/profile/player-profile.catalog.js";
import {
  validatePlayerProfilePatch,
} from "../../../../src/nest/player/profile/player-profile.validation.js";

test("catálogo de roles contém as funções aprovadas", () => {
  assert.deepEqual(
    PLAYER_PROFILE_ROLE_OPTIONS.map(
      (option) => option.key,
    ),
    [
      "awper",
      "rifler",
      "entry_fragger",
      "lurker",
      "support",
      "igl",
      "anchor",
    ],
  );
});

test("catálogo de mapas usa as chaves canônicas do ecossistema HSC/CS2", () => {
  const keys =
    PLAYER_PROFILE_MAP_OPTIONS.map(
      (option) => option.key,
    );

  for (const key of [
    "de_mirage",
    "de_dust2",
    "de_cache",
    "de_overpass",
    "de_boulder",
    "de_fachwerk",
    "cs_shelter",
    "de_debris",
    "de_eldorado",
    "de_poseidon",
  ]) {
    assert.equal(
      keys.includes(
        key as (typeof keys)[number],
      ),
      true,
      `missing ${key}`,
    );
  }

  assert.equal(
    new Set(keys).size,
    keys.length,
  );
});

test("PATCH normaliza campos válidos sem aceitar propriedades arbitrárias", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      displayName: "  Lavos  ",
      slug: "  Lavos-CS2 ",
      bio: " Heavy roots\nCS2 player ",
      discordHandle: " lavos ",
      preferredRole: " AWPer ",
      preferredMap: " DE_MIRAGE ",
      visibility: " PUBLIC ",
      playerAccountId: "must-be-ignored",
      email: "must-be-ignored@example.com",
    }),
    {
      ok: true,
      patch: {
        displayName: "Lavos",
        slug: "lavos-cs2",
        bio: "Heavy roots\nCS2 player",
        discordHandle: "lavos",
        preferredRole: "awper",
        preferredMap: "de_mirage",
        visibility: "public",
      },
    },
  );
});

test("PATCH recusa slug inválido ou reservado", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      slug: "admin",
    }),
    {
      ok: false,
      error: "slug_reserved",
    },
  );

  assert.deepEqual(
    validatePlayerProfilePatch({
      slug: "bad_slug",
    }),
    {
      ok: false,
      error: "invalid_slug",
    },
  );
});

test("PATCH recusa role e mapa fora dos catálogos", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      preferredRole: "coach",
    }),
    {
      ok: false,
      error: "invalid_preferred_role",
    },
  );

  assert.deepEqual(
    validatePlayerProfilePatch({
      preferredMap: "de_unknown",
    }),
    {
      ok: false,
      error: "invalid_preferred_map",
    },
  );
});

test("PATCH exige upload dedicado para avatar e banner", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      avatarUrl:
        "https://cdn.example.com/avatar.png",
    }),
    {
      ok: false,
      error:
        "profile_media_must_be_uploaded",
    },
  );

  assert.deepEqual(
    validatePlayerProfilePatch({
      bannerUrl: null,
    }),
    {
      ok: false,
      error:
        "profile_media_must_be_uploaded",
    },
  );
});

test("PATCH aceita null para limpar campos opcionais", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      bio: null,
      discordHandle: null,
      preferredRole: null,
      preferredMap: null,
    }),
    {
      ok: true,
      patch: {
        bio: null,
        discordHandle: null,
        preferredRole: null,
        preferredMap: null,
      },
    },
  );
});

test("PATCH reserva namespace técnico dos perfis automáticos", () => {
  assert.deepEqual(
    validatePlayerProfilePatch({
      slug:
        "player-0123456789abcdef0123456789abcdef",
    }),
    {
      ok: false,
      error: "slug_reserved",
    },
  );
});
