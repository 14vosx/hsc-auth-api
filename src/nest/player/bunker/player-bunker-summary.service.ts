import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { ContentSeasonsRepository, SeasonRow } from "../../content/seasons/content-seasons.repository.js";
import { PlayerIdentity } from "../auth/player-auth.service.js";
import { SeasonPlayerArtifactService } from "./season-player-artifact.service.js";
import { CompetitiveProfileService, CompetitiveProfileResult } from "./competitive-profile.service.js";

const SENSITIVE_ARTIFACT_KEY_RE = /(token|cookie|hash)/i;

@Injectable()
export class PlayerBunkerSummaryService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly seasonsRepository: ContentSeasonsRepository,
    private readonly artifactService: SeasonPlayerArtifactService,
    private readonly competitiveProfileService: CompetitiveProfileService,
  ) {}

  private sanitizeArtifact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeArtifact(item));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_ARTIFACT_KEY_RE.test(key))
        .map(([key, item]) => [key, this.sanitizeArtifact(item)]),
    );
  }

  private buildPlayerData(
    player: PlayerIdentity,
    competitiveProfile?: Record<string, unknown> | null,
  ) {
    const displayName =
      player.displayName ??
      (typeof competitiveProfile?.name === "string"
        ? competitiveProfile.name
        : null) ??
      null;

    const avatarMedium =
      player.avatarMedium ??
      (typeof competitiveProfile?.avatarMedium === "string"
        ? competitiveProfile.avatarMedium
        : null) ??
      null;

    const steamProfileUrl =
      player.steamProfileUrl ??
      (typeof competitiveProfile?.steamProfileUrl === "string"
        ? competitiveProfile.steamProfileUrl
        : null) ??
      null;

    return {
      playerAccountId: player.playerAccountId ?? null,
      steamid64: player.steamid64 ?? null,
      displayName,
      ...(avatarMedium ? { avatarMedium } : {}),
      ...(steamProfileUrl ? { steamProfileUrl } : {}),
    };
  }

  private buildCompetitiveProfileNotes(
    competitiveProfileResult: CompetitiveProfileResult,
  ): string[] {
    if (competitiveProfileResult.ok) {
      return ["competitive_profile_connected"];
    }

    if (competitiveProfileResult.reason !== "not_configured") {
      return ["competitive_profile_unavailable"];
    }

    return [];
  }

  private toPublicDate(value: string | Date | null | undefined): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value ?? null;
  }

  private buildCurrentSeason(activeSeason: SeasonRow | null) {
    if (!activeSeason) {
      return null;
    }

    return {
      slug: activeSeason.slug,
      name: activeSeason.name,
      status: activeSeason.status,
      scope: {
        startAt: this.toPublicDate(activeSeason.start_at),
        endAt: this.toPublicDate(activeSeason.end_at),
      },
    };
  }

  private async getActiveSeasonState(): Promise<{
    available: boolean;
    activeSeason: SeasonRow | null;
  }> {
    try {
      const activeSeason = await this.seasonsRepository.getActiveSeason();
      return {
        available: true,
        activeSeason,
      };
    } catch {
      return {
        available: false,
        activeSeason: null,
      };
    }
  }

  private artifactSeasonSlugDiffers(
    artifact: unknown,
    activeSeason: SeasonRow,
  ): boolean {
    if (artifact && typeof artifact === "object" && "season" in artifact) {
      const seasonObj = (artifact as Record<string, unknown>).season;
      if (seasonObj && typeof seasonObj === "object" && "slug" in seasonObj) {
        const artifactSeasonSlug = (seasonObj as Record<string, unknown>).slug;
        return (
          artifactSeasonSlug != null &&
          artifactSeasonSlug !== activeSeason.slug
        );
      }
    }
    return false;
  }

  private buildFallbackData(input: {
    player: PlayerIdentity;
    note: string;
    competitiveProfileResult: CompetitiveProfileResult;
    activeSeason: SeasonRow | null;
  }) {
    const competitiveProfile = input.competitiveProfileResult.ok
      ? input.competitiveProfileResult.profile
      : null;

    return {
      player: this.buildPlayerData(input.player, competitiveProfile),
      bunker: {
        status: input.player.steamid64 ? "ready" : "unavailable",
        seasonFirst: true,
        statsAvailable: false,
      },
      currentSeason: this.buildCurrentSeason(input.activeSeason),
      lifetime: null,
      competitiveProfile,
      notes: [
        "real_player_identity_connected",
        input.note,
        ...this.buildCompetitiveProfileNotes(input.competitiveProfileResult),
      ],
    };
  }

  private buildReadyData(input: {
    player: PlayerIdentity;
    artifact: unknown;
    competitiveProfileResult: CompetitiveProfileResult;
    activeSeason: SeasonRow;
  }) {
    const seasonPlayer = this.sanitizeArtifact(input.artifact);
    const competitiveProfile = input.competitiveProfileResult.ok
      ? input.competitiveProfileResult.profile
      : null;

    return {
      player: this.buildPlayerData(input.player, competitiveProfile),
      bunker: {
        status: "ready",
        seasonFirst: true,
        statsAvailable: true,
      },
      currentSeason: this.buildCurrentSeason(input.activeSeason),
      lifetime: null,
      seasonPlayer,
      competitiveProfile,
      notes: [
        "real_player_identity_connected",
        "season_player_artifact_connected",
        ...this.buildCompetitiveProfileNotes(input.competitiveProfileResult),
      ],
    };
  }

  async build(player: PlayerIdentity): Promise<unknown> {
    const bunkerConfig = this.config.playerBunker;

    const competitiveProfileResult = await this.competitiveProfileService.read({
      baseUrl: bunkerConfig.staticApiBaseUrl,
      timeoutMs: bunkerConfig.staticApiTimeoutMs,
      steamid64: player.steamid64,
    });

    const activeSeasonState = await this.getActiveSeasonState();
    const activeSeason = activeSeasonState.activeSeason;

    if (!activeSeasonState.available) {
      return this.buildFallbackData({
        player,
        note: "active_season_unavailable",
        competitiveProfileResult,
        activeSeason: null,
      });
    }

    if (!activeSeason) {
      return this.buildFallbackData({
        player,
        note: "no_active_season",
        competitiveProfileResult,
        activeSeason: null,
      });
    }

    if (
      bunkerConfig.activeSeasonSlug &&
      bunkerConfig.activeSeasonSlug !== activeSeason.slug
    ) {
      return this.buildFallbackData({
        player,
        note: "season_artifact_slug_mismatch",
        competitiveProfileResult,
        activeSeason,
      });
    }

    try {
      const result = await this.artifactService.read({
        root: bunkerConfig.artifactRoot,
        seasonSlug: activeSeason.slug,
        steamid64: player.steamid64,
      });

      if (
        result.ok &&
        this.artifactSeasonSlugDiffers(result.artifact, activeSeason)
      ) {
        return this.buildFallbackData({
          player,
          note: "season_artifact_slug_mismatch",
          competitiveProfileResult,
          activeSeason,
        });
      }

      if (result.ok) {
        return this.buildReadyData({
          player,
          artifact: result.artifact,
          competitiveProfileResult,
          activeSeason,
        });
      }

      if (
        result.reason === "not_configured" ||
        result.reason === "not_found"
      ) {
        return this.buildFallbackData({
          player,
          note: result.reason,
          competitiveProfileResult,
          activeSeason,
        });
      }

      return this.buildFallbackData({
        player,
        note: "season_player_artifact_unavailable",
        competitiveProfileResult,
        activeSeason,
      });
    } catch {
      return this.buildFallbackData({
        player,
        note: "season_player_artifact_unavailable",
        competitiveProfileResult,
        activeSeason,
      });
    }
  }
}
