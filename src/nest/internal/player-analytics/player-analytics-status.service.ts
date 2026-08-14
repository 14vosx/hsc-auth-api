import { Injectable } from "@nestjs/common";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";

@Injectable()
export class PlayerAnalyticsStatusService {
  constructor(private readonly storage: PlayerAnalyticsStorageService) {}

  async get(generationId: string) {
    return {
      ok: true as const,
      generationId,
      state: await this.storage.status(generationId),
    };
  }
}
