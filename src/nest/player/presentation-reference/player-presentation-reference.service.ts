import { Injectable } from "@nestjs/common";
import { SteamProfilesService } from "../../internal/steam/steam-profiles.service.js";
import type {
  PlayerPresentationReference,
  PlayerPresentationReferencesResolution,
} from "./player-presentation-reference.contract.js";
import { PlayerPresentationReferenceRepository } from "./player-presentation-reference.repository.js";

@Injectable()
export class PlayerPresentationReferenceService {
  constructor(
    private readonly repository: PlayerPresentationReferenceRepository,
    private readonly steamProfilesService: SteamProfilesService,
  ) {}

  async resolveBySteamIds(
    inputSteamIds: string[],
  ): Promise<PlayerPresentationReferencesResolution> {
    const steamIds = [...new Set(inputSteamIds)];
    if (steamIds.length === 0) return { references: {}, missing: [] };

    const [steamResolution, publicSlugs] = await Promise.all([
      this.steamProfilesService.resolveProfiles(steamIds),
      this.repository.getPublicProfileSlugsBySteamIds(steamIds),
    ]);
    const references: Record<string, PlayerPresentationReference> = {};
    for (const steamId64 of steamIds) {
      const steamProfile = steamResolution.profiles[steamId64];
      const slug = publicSlugs.get(steamId64);
      references[steamId64] = {
        steam: {
          steamId64,
          personaname: steamProfile?.personaname ?? null,
          avatarMediumUrl: steamProfile?.avatar_medium_url ?? null,
        },
        profile: slug ? { slug } : null,
      };
    }
    return { references, missing: steamResolution.missing };
  }

  async resolveByPlayerAccountIds(
    inputPlayerAccountIds: string[],
  ): Promise<Map<string, PlayerPresentationReference | null>> {
    const playerAccountIds = [...new Set(inputPlayerAccountIds)];
    const steamIdsByAccount = await this.repository.getSteamIdsByPlayerAccountIds(
      playerAccountIds,
    );
    const steamIds = [...new Set(steamIdsByAccount.values())];
    const { references } = await this.resolveBySteamIds(steamIds);
    const result = new Map<string, PlayerPresentationReference | null>();
    for (const playerAccountId of playerAccountIds) {
      const steamId64 = steamIdsByAccount.get(playerAccountId);
      result.set(playerAccountId, steamId64 ? references[steamId64] ?? null : null);
    }
    return result;
  }
}
