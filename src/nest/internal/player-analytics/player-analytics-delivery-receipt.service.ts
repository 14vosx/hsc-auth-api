import { HttpStatus, Injectable } from "@nestjs/common";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { PlayerAnalyticsError } from "./player-analytics-error.js";
import { isValidGenerationId } from "./player-analytics-contract.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";

export type PlayerAnalyticsLifecycleState = "received" | "accepted" | "rejected";

export interface PlayerAnalyticsDeliveryReceipt {
  readonly generationId: string;
  readonly packageSha256: string;
  readonly packageBytes: number;
  readonly receivedAt: string;
  readonly publishedAt: string | null;
  readonly lifecycleState: PlayerAnalyticsLifecycleState;
}

const SHA256 = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && UTC_TIMESTAMP.test(value)
    && new Date(value).toISOString() === value;
}

function parseReceipt(value: unknown): PlayerAnalyticsDeliveryReceipt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
  const receipt = value as Record<string, unknown>;
  if (Object.keys(receipt).sort().join(",") !==
    "generationId,lifecycleState,packageBytes,packageSha256,publishedAt,receivedAt") throw new Error();
  if (typeof receipt.generationId !== "string" || !isValidGenerationId(receipt.generationId)
    || typeof receipt.packageSha256 !== "string" || !SHA256.test(receipt.packageSha256)
    || typeof receipt.packageBytes !== "number" || !Number.isSafeInteger(receipt.packageBytes) || receipt.packageBytes <= 0
    || !validTimestamp(receipt.receivedAt)
    || (receipt.publishedAt !== null && !validTimestamp(receipt.publishedAt))
    || !["received", "accepted", "rejected"].includes(String(receipt.lifecycleState))) throw new Error();
  return {
    generationId: receipt.generationId,
    packageSha256: receipt.packageSha256,
    packageBytes: Number(receipt.packageBytes),
    receivedAt: receipt.receivedAt,
    publishedAt: receipt.publishedAt as string | null,
    lifecycleState: receipt.lifecycleState as PlayerAnalyticsLifecycleState,
  };
}

@Injectable()
export class PlayerAnalyticsDeliveryReceiptService {
  constructor(private readonly storage: PlayerAnalyticsStorageService) {}

  async read(generationId: string): Promise<PlayerAnalyticsDeliveryReceipt | null> {
    const target = this.storage.deliveryPath(generationId);
    try {
      const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.nlink !== 1) throw new Error();
        return parseReceipt(JSON.parse(await handle.readFile("utf8")) as unknown);
      } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof SyntaxError || !(error instanceof PlayerAnalyticsError)) {
        throw new PlayerAnalyticsError(HttpStatus.INTERNAL_SERVER_ERROR, "player_analytics_storage_inconsistent");
      }
      throw error;
    }
  }

  async ensure(
    generationId: string,
    packageSha256: string,
    packageBytes: number,
    receivedAt: string,
  ): Promise<PlayerAnalyticsDeliveryReceipt> {
    if (!validTimestamp(receivedAt)) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
    return this.storage.withLifecycleLock(generationId, async () => {
      const existing = await this.read(generationId);
      if (existing) {
        if (existing.packageSha256 !== packageSha256 || existing.packageBytes !== packageBytes) {
          throw new PlayerAnalyticsError(HttpStatus.CONFLICT, "generation_id_conflict");
        }
        return existing;
      }
      const receipt: PlayerAnalyticsDeliveryReceipt = {
        generationId, packageSha256, packageBytes, receivedAt,
        publishedAt: null, lifecycleState: "received",
      };
      await this.write(receipt);
      return receipt;
    });
  }

  async markPublished(generationId: string, publishedAt: string): Promise<void> {
    await this.update(generationId, (receipt) => receipt.publishedAt === null
      ? { ...receipt, publishedAt }
      : receipt);
  }

  async markPublishedWithinLock(generationId: string, publishedAt: string): Promise<void> {
    const receipt = await this.read(generationId);
    if (!receipt) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
    if (receipt.publishedAt === null) await this.write({ ...receipt, publishedAt });
  }

  async markLifecycle(generationId: string, lifecycleState: "accepted" | "rejected"): Promise<void> {
    await this.update(generationId, (receipt) => ({ ...receipt, lifecycleState }));
  }

  async markLifecycleWithinLock(
    generationId: string,
    lifecycleState: "accepted" | "rejected",
  ): Promise<void> {
    const receipt = await this.read(generationId);
    if (!receipt) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
    await this.write({ ...receipt, lifecycleState });
  }

  private async update(
    generationId: string,
    change: (receipt: PlayerAnalyticsDeliveryReceipt) => PlayerAnalyticsDeliveryReceipt,
  ): Promise<void> {
    await this.storage.withLifecycleLock(generationId, async () => {
      const receipt = await this.read(generationId);
      if (!receipt) throw new PlayerAnalyticsError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_analytics_storage_inconsistent",
      );
      await this.write(change(receipt));
    });
  }

  private write(receipt: PlayerAnalyticsDeliveryReceipt): Promise<void> {
    return this.storage.atomicWrite(
      this.storage.deliveryPath(receipt.generationId),
      `${JSON.stringify(receipt)}\n`,
    );
  }
}
