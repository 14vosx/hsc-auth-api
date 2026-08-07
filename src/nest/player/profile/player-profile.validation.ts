import {
  isTechnicalPlayerProfileSlug,
} from "./player-profile.defaults.js";
import {
  isPlayerProfilePreferredMap,
  isPlayerProfilePreferredRole,
  isPlayerProfileVisibility,
  PLAYER_PROFILE_RESERVED_SLUGS,
  type PlayerProfilePreferredMap,
  type PlayerProfilePreferredRole,
  type PlayerProfileVisibility,
} from "./player-profile.catalog.js";

export interface PlayerProfilePatch {
  displayName?: string;
  slug?: string;
  bio?: string | null;
  discordHandle?: string | null;
  preferredRole?: PlayerProfilePreferredRole | null;
  preferredMap?: PlayerProfilePreferredMap | null;
  visibility?: PlayerProfileVisibility;
}

export type PlayerProfilePatchValidationError =
  | "invalid_profile_patch"
  | "invalid_display_name"
  | "invalid_slug"
  | "slug_reserved"
  | "invalid_bio"
  | "profile_media_must_be_uploaded"
  | "invalid_discord_handle"
  | "invalid_preferred_role"
  | "invalid_preferred_map"
  | "invalid_visibility";

export type PlayerProfilePatchValidationResult =
  | {
      ok: true;
      patch: PlayerProfilePatch;
    }
  | {
      ok: false;
      error: PlayerProfilePatchValidationError;
    };

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function containsForbiddenControlCharacters(
  value: string,
  allowMultiline = false,
): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);

    if (code === undefined) {
      continue;
    }

    if (
      code === 0x7f ||
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f)
    ) {
      return true;
    }

    if (
      !allowMultiline &&
      (code === 0x09 ||
        code === 0x0a ||
        code === 0x0d)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeNullableText(
  input: unknown,
  maxLength: number,
  allowMultiline = false,
): { ok: true; value: string | null } | { ok: false } {
  if (input === null) {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof input !== "string") {
    return {
      ok: false,
    };
  }

  const value = input.trim();

  if (!value) {
    return {
      ok: true,
      value: null,
    };
  }

  if (
    unicodeLength(value) > maxLength ||
    containsForbiddenControlCharacters(
      value,
      allowMultiline,
    )
  ) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value,
  };
}

export function validatePlayerProfilePatch(
  body: unknown,
): PlayerProfilePatchValidationResult {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return {
      ok: false,
      error: "invalid_profile_patch",
    };
  }

  const input = body as Record<string, unknown>;
  const patch: PlayerProfilePatch = {};

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "avatarUrl",
    ) ||
    Object.prototype.hasOwnProperty.call(
      input,
      "bannerUrl",
    )
  ) {
    return {
      ok: false,
      error:
        "profile_media_must_be_uploaded",
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "displayName",
    )
  ) {
    if (typeof input.displayName !== "string") {
      return {
        ok: false,
        error: "invalid_display_name",
      };
    }

    const displayName = input.displayName.trim();

    if (
      !displayName ||
      unicodeLength(displayName) > 255 ||
      containsForbiddenControlCharacters(
        displayName,
      )
    ) {
      return {
        ok: false,
        error: "invalid_display_name",
      };
    }

    patch.displayName = displayName;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "slug",
    )
  ) {
    if (typeof input.slug !== "string") {
      return {
        ok: false,
        error: "invalid_slug",
      };
    }

    const slug = input.slug
      .trim()
      .toLowerCase();

    if (
      slug.length < 3 ||
      slug.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        slug,
      )
    ) {
      return {
        ok: false,
        error: "invalid_slug",
      };
    }

    if (
      PLAYER_PROFILE_RESERVED_SLUGS.has(slug) ||
      isTechnicalPlayerProfileSlug(slug)
    ) {
      return {
        ok: false,
        error: "slug_reserved",
      };
    }

    patch.slug = slug;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "bio",
    )
  ) {
    const bio = normalizeNullableText(
      input.bio,
      500,
      true,
    );

    if (!bio.ok) {
      return {
        ok: false,
        error: "invalid_bio",
      };
    }

    patch.bio = bio.value;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "discordHandle",
    )
  ) {
    const discordHandle =
      normalizeNullableText(
        input.discordHandle,
        100,
      );

    if (!discordHandle.ok) {
      return {
        ok: false,
        error: "invalid_discord_handle",
      };
    }

    patch.discordHandle =
      discordHandle.value;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "preferredRole",
    )
  ) {
    if (input.preferredRole === null) {
      patch.preferredRole = null;
    } else if (
      typeof input.preferredRole === "string"
    ) {
      const preferredRole =
        input.preferredRole
          .trim()
          .toLowerCase();

      if (
        !isPlayerProfilePreferredRole(
          preferredRole,
        )
      ) {
        return {
          ok: false,
          error: "invalid_preferred_role",
        };
      }

      patch.preferredRole = preferredRole;
    } else {
      return {
        ok: false,
        error: "invalid_preferred_role",
      };
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "preferredMap",
    )
  ) {
    if (input.preferredMap === null) {
      patch.preferredMap = null;
    } else if (
      typeof input.preferredMap === "string"
    ) {
      const preferredMap =
        input.preferredMap
          .trim()
          .toLowerCase();

      if (
        !isPlayerProfilePreferredMap(
          preferredMap,
        )
      ) {
        return {
          ok: false,
          error: "invalid_preferred_map",
        };
      }

      patch.preferredMap = preferredMap;
    } else {
      return {
        ok: false,
        error: "invalid_preferred_map",
      };
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "visibility",
    )
  ) {
    if (typeof input.visibility !== "string") {
      return {
        ok: false,
        error: "invalid_visibility",
      };
    }

    const visibility =
      input.visibility
        .trim()
        .toLowerCase();

    if (
      !isPlayerProfileVisibility(visibility)
    ) {
      return {
        ok: false,
        error: "invalid_visibility",
      };
    }

    patch.visibility = visibility;
  }

  return {
    ok: true,
    patch,
  };
}
