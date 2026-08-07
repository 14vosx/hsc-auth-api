import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  PLAYER_PROFILE_RESERVED_SLUGS,
} from "./player-profile.catalog.js";
import {
  isTechnicalPlayerProfileSlug,
} from "./player-profile.defaults.js";
import {
  PlayerPublicProfileRepository,
  type PlayerPublicProfile,
} from "./player-public-profile.repository.js";

export interface PlayerPublicProfileRepositoryPort {
  findPublicProfileBySlug(
    slug: string,
  ): Promise<PlayerPublicProfile | null>;
}

export type PlayerPublicProfileReadResult =
  | {
      ok: true;
      profile: PlayerPublicProfile;
    }
  | {
      ok: false;
      error: "player_not_found";
    };

function normalizePublicProfileSlug(
  rawSlug: unknown,
): string | null {
  if (typeof rawSlug !== "string") {
    return null;
  }

  const slug =
    rawSlug.trim().toLowerCase();

  if (
    slug.length < 3 ||
    slug.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      slug,
    ) ||
    PLAYER_PROFILE_RESERVED_SLUGS.has(slug) ||
    isTechnicalPlayerProfileSlug(slug)
  ) {
    return null;
  }

  return slug;
}

@Injectable()
export class PlayerPublicProfileService {
  constructor(
    @Inject(PlayerPublicProfileRepository)
    private readonly repository:
      PlayerPublicProfileRepositoryPort,
  ) {}

  async getPublicProfileBySlug(
    rawSlug: unknown,
  ): Promise<PlayerPublicProfileReadResult> {
    const slug =
      normalizePublicProfileSlug(rawSlug);

    if (!slug) {
      return {
        ok: false,
        error: "player_not_found",
      };
    }

    const profile =
      await this.repository
        .findPublicProfileBySlug(slug);

    if (!profile) {
      return {
        ok: false,
        error: "player_not_found",
      };
    }

    return {
      ok: true,
      profile,
    };
  }
}
