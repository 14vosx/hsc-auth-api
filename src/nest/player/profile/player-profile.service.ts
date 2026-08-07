import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  PlayerProfileRepository,
  type PlayerProfileEnsureResult,
  type PlayerProfileUpdateResult,
} from "./player-profile.repository.js";
import {
  validatePlayerProfilePatch,
  type PlayerProfilePatchValidationError,
} from "./player-profile.validation.js";

export interface PlayerProfileRepositoryPort {
  ensureProfileForAccount(
    playerAccountId: string,
  ): Promise<PlayerProfileEnsureResult>;

  updateProfileForAccount(
    playerAccountId: string,
    patch: Parameters<
      PlayerProfileRepository["updateProfileForAccount"]
    >[1],
  ): Promise<PlayerProfileUpdateResult>;
}

export type PlayerProfileUpdateServiceResult =
  | PlayerProfileUpdateResult
  | {
      ok: false;
      error: PlayerProfilePatchValidationError;
    };

@Injectable()
export class PlayerProfileService {
  constructor(
    @Inject(PlayerProfileRepository)
    private readonly repository:
      PlayerProfileRepositoryPort,
  ) {}

  async getMyProfile(
    playerAccountId: string,
  ): Promise<PlayerProfileEnsureResult> {
    return this.repository.ensureProfileForAccount(
      playerAccountId,
    );
  }

  async updateMyProfile(
    playerAccountId: string,
    body: unknown,
  ): Promise<PlayerProfileUpdateServiceResult> {
    const validation =
      validatePlayerProfilePatch(body);

    if (!validation.ok) {
      return validation;
    }

    return this.repository.updateProfileForAccount(
      playerAccountId,
      validation.patch,
    );
  }
}
