import { Injectable } from "@nestjs/common";
import { PlayerAnalyticsStorageService } from "../../internal/player-analytics/player-analytics-storage.service.js";

export type PlayerAnalyticsCurrentGenerationSnapshot =
  | {
      ok: true;
      generationId: string;
      root: string;
    }
  | {
      ok: false;
      reason: "not_found" | "unavailable";
    };

@Injectable()
export class PlayerAnalyticsCurrentGenerationService {
  constructor(private readonly storage: PlayerAnalyticsStorageService) {}

  async read(): Promise<PlayerAnalyticsCurrentGenerationSnapshot> {
    try {
      const generationId = await this.storage.readCurrent();
      if (!generationId) {
        return { ok: false, reason: "not_found" };
      }

      const root = this.storage.acceptedPath(generationId);
      if (!(await this.storage.isRealDirectory(root))) {
        return { ok: false, reason: "unavailable" };
      }

      return { ok: true, generationId, root };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
}
