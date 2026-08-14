import { HttpStatus, Injectable } from "@nestjs/common";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsError } from "./player-analytics-error.js";
import { PlayerAnalyticsGenerationInvalidError } from "./player-analytics-generation-invalid.error.js";
import { PlayerAnalyticsGenerationValidatorService } from "./player-analytics-generation-validator.service.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";

export type PlayerAnalyticsLifecycleResult = "accepted" | "current" | "rejected";

@Injectable()
export class PlayerAnalyticsLifecycleService {
  constructor(
    private readonly storage: PlayerAnalyticsStorageService,
    private readonly receipts: PlayerAnalyticsDeliveryReceiptService,
    private readonly validator: PlayerAnalyticsGenerationValidatorService,
  ) {}

  async processGeneration(generationId: string): Promise<PlayerAnalyticsLifecycleResult> {
    await this.storage.initialize();
    return this.storage.withLifecycleLock(generationId, async () => {
      let state = await this.storage.status(generationId);
      const receipt = await this.receipts.read(generationId);
      if (state === "not_found" && receipt?.lifecycleState === "accepted") return "accepted";
      if (state === "not_found" && receipt?.lifecycleState === "rejected") return "rejected";
      if (state === "not_found") throw this.inconsistent();
      if (state === "rejected") {
        if (receipt?.lifecycleState !== "rejected") {
          await this.receipts.markLifecycleWithinLock(generationId, "rejected");
        }
        return "rejected";
      }
      if (state === "incoming") {
        try {
          await this.validator.validate(this.storage.incomingPath(generationId), generationId);
        } catch (error) {
          if (!(error instanceof PlayerAnalyticsGenerationInvalidError)) throw error;
          await this.storage.transition(
            this.storage.incomingPath(generationId),
            this.storage.rejectedPath(generationId),
          );
          await this.receipts.markLifecycleWithinLock(generationId, "rejected");
          return "rejected";
        }
        await this.storage.transition(
          this.storage.incomingPath(generationId),
          this.storage.acceptedPath(generationId),
        );
        await this.receipts.markLifecycleWithinLock(generationId, "accepted");
        state = "accepted";
      }
      if (state === "accepted" && receipt?.lifecycleState !== "accepted") {
        await this.receipts.markLifecycleWithinLock(generationId, "accepted");
      }
      const activation = await this.activate(generationId);
      await this.retainAccepted();
      return activation;
    });
  }

  private async activate(generationId: string): Promise<"accepted" | "current"> {
    const current = await this.storage.readCurrent();
    if (current === generationId) return "current";
    const candidateTime = await this.readGeneratedAt(generationId);
    if (current === null) {
      await this.storage.writeCurrent(generationId);
      return "current";
    }
    const currentTime = await this.readGeneratedAt(current);
    if (candidateTime > currentTime) {
      await this.storage.writeCurrent(generationId);
      return "current";
    }
    return "accepted";
  }

  private async retainAccepted(): Promise<void> {
    const current = await this.storage.readCurrent();
    const accepted = await this.storage.listAccepted();
    if (accepted.length <= 6) return;
    if (current === null || !accepted.includes(current)) throw this.inconsistent();
    const dated = await Promise.all(accepted.filter((id) => id !== current).map(async (id) => ({
      id,
      generatedAt: await this.readGeneratedAt(id),
    })));
    dated.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)
      || right.id.localeCompare(left.id));
    for (const generation of dated.slice(5)) {
      await this.storage.remove(this.storage.acceptedPath(generation.id));
    }
  }

  private async readGeneratedAt(generationId: string): Promise<string> {
    const target = `${this.storage.acceptedPath(generationId)}/generation-manifest.json`;
    try {
      const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.nlink !== 1) throw this.inconsistent();
        const value = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>;
        if (typeof value.generatedAt !== "string"
          || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.generatedAt)) throw this.inconsistent();
        return value.generatedAt;
      } finally { await handle.close(); }
    } catch (error) {
      if (error instanceof PlayerAnalyticsError) throw error;
      throw this.inconsistent();
    }
  }

  private inconsistent(): PlayerAnalyticsError {
    return new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
  }
}
