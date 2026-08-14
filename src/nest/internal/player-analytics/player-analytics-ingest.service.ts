import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { extract, Parser, type ReadEntry } from "tar";
import { APP_CONFIG, AppConfig } from "../../core/app-config.js";
import { PlayerAnalyticsError } from "./player-analytics-error.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";

export interface IngestResult {
  readonly ok: true;
  readonly generationId: string;
  readonly state: "incoming" | "accepted" | "current" | "rejected";
  readonly packageSha256: string;
  readonly packageBytes: number;
}

export function archivePathIsSafe(input: string): boolean {
  if (!input || input.includes("\0") || input.includes("\\")) return false;
  if (pathIsAbsolute(input)) return false;
  const normalized = input.replace(/^\.\/+/, "");
  return normalized.length > 0
    && normalized.split("/").every((segment) => segment !== "..");
}

function pathIsAbsolute(input: string): boolean {
  return input.startsWith("/") || /^[A-Za-z]:/.test(input);
}

function isRegularType(type: string): boolean {
  return type === "File" || type === "OldFile" || type === "ContiguousFile";
}

export function archiveEntryIsSafe(input: string, type: string): boolean {
  if (input === "." || input === "./") return type === "Directory";
  return archivePathIsSafe(input) && (isRegularType(type) || type === "Directory");
}

const STORAGE_ERROR_CODES = new Set([
  "EACCES", "EDQUOT", "EEXIST", "EFBIG", "EIO", "EMFILE", "ENAMETOOLONG",
  "ENFILE", "ENOENT", "ENOSPC", "ENOTDIR", "EPERM", "EROFS", "ESTALE",
]);

function isStorageError(error: unknown): boolean {
  return STORAGE_ERROR_CODES.has((error as NodeJS.ErrnoException).code ?? "");
}

@Injectable()
export class PlayerAnalyticsIngestService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly storage: PlayerAnalyticsStorageService,
    private readonly receipts: PlayerAnalyticsDeliveryReceiptService,
  ) {}

  get maxPackageBytes(): number {
    return this.config.playerAnalytics.maxPackageBytes;
  }

  async ingest(request: IncomingMessage, generationId: string): Promise<IngestResult> {
    const limits = this.config.playerAnalytics;
    const operationId = this.storage.newOperationId();
    const uploadPath = this.storage.uploadPath(operationId);
    const extractPath = this.storage.extractPath(operationId);
    let primaryError: unknown;

    await this.storage.initialize();
    try {
      const uploaded = await this.streamUpload(request, uploadPath, limits.maxPackageBytes);
      const packagePath = this.storage.packagePath(generationId);
      const existingReceipt = await this.receipts.read(generationId);
      let existingState = await this.storage.status(generationId);
      if (existingState === "not_found" && existingReceipt?.lifecycleState === "accepted") existingState = "accepted";
      if (existingState === "not_found" && existingReceipt?.lifecycleState === "rejected") existingState = "rejected";
      if (!existingReceipt && existingState !== "not_found") {
        throw new PlayerAnalyticsError(HttpStatus.INTERNAL_SERVER_ERROR, "player_analytics_storage_inconsistent");
      }
      let packageExists = await this.storage.exists(packagePath);
      if (existingReceipt && !packageExists && existingState === "not_found") {
        throw new PlayerAnalyticsError(HttpStatus.INTERNAL_SERVER_ERROR, "player_analytics_storage_inconsistent");
      }
      if (!existingReceipt && !packageExists) {
        try {
          await link(uploadPath, packagePath);
          packageExists = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          packageExists = true;
        }
      }
      const receipt = await this.receipts.ensure(
        generationId,
        uploaded.sha256,
        uploaded.bytes,
        new Date().toISOString(),
      );
      if (["current", "accepted", "rejected"].includes(existingState)) {
        return this.result(generationId, existingState as IngestResult["state"], receipt);
      }
      if (existingState === "incoming") {
        if (!packageExists || await this.storage.sha256(packagePath) !== uploaded.sha256) {
          throw new PlayerAnalyticsError(HttpStatus.INTERNAL_SERVER_ERROR, "player_analytics_storage_inconsistent");
        }
        return this.result(generationId, "incoming", receipt);
      }
      if (await this.storage.sha256(packagePath) !== uploaded.sha256) {
        throw new PlayerAnalyticsError(HttpStatus.CONFLICT, "generation_id_conflict");
      }
      if (packageExists) {
        if (await this.storage.sha256(packagePath) !== uploaded.sha256) {
          throw new PlayerAnalyticsError(HttpStatus.CONFLICT, "generation_id_conflict");
        }
        if (await this.storage.exists(this.storage.incomingPath(generationId))) {
          return this.result(generationId, "incoming", receipt);
        }
      }

      await this.inspectArchive(packagePath, limits.maxEntries, limits.maxExtractedBytes);
      await this.extractArchive(packagePath, extractPath);
      await this.storage.inspectExtractedTree(extractPath, limits.maxExtractedBytes);
      this.validateManifest(await this.storage.readManifest(extractPath), generationId);

      const published = await this.storage.promoteExtractIfAbsent(extractPath, generationId);
      if (!published) {
        const stateAfterRace = await this.storage.status(generationId);
        if (stateAfterRace !== "incoming") {
          throw new PlayerAnalyticsError(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "player_analytics_storage_inconsistent",
          );
        }
        if (await this.storage.sha256(packagePath) !== uploaded.sha256) {
          throw new PlayerAnalyticsError(HttpStatus.CONFLICT, "generation_id_conflict");
        }
      }
      return this.result(generationId, "incoming", receipt);
    } catch (error) {
      primaryError = error instanceof PlayerAnalyticsError
        ? error
        : new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_unavailable",
        );
      throw primaryError;
    } finally {
      let cleanupError: unknown;
      try { await this.storage.remove(uploadPath); } catch (error) { cleanupError = error; }
      try { await this.storage.remove(extractPath); } catch (error) { cleanupError ??= error; }
      if (!primaryError && cleanupError) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_unavailable",
        );
      }
    }
  }

  private async streamUpload(
    request: IncomingMessage,
    target: string,
    maxBytes: number,
  ): Promise<{ sha256: string; bytes: number }> {
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          callback(new PlayerAnalyticsError(HttpStatus.PAYLOAD_TOO_LARGE, "package_too_large"));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(request, meter, createWriteStream(target, { flags: "wx", mode: 0o600 }));
    } catch (error) {
      if (error instanceof PlayerAnalyticsError) throw error;
      if (isStorageError(error)) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_unavailable",
        );
      }
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_package");
    }
    return { sha256: hash.digest("hex"), bytes };
  }

  private async inspectArchive(
    packagePath: string,
    maxEntries: number,
    maxExtractedBytes: number,
  ): Promise<void> {
    let entries = 0;
    let declaredBytes = 0;
    let validationError: PlayerAnalyticsError | undefined;
    let parser: Parser;
    try {
      parser = new Parser({
        gzip: true,
        strict: true,
        onReadEntry: (entry: ReadEntry) => {
          if (validationError) return;
          entries += 1;
          if (entries > maxEntries) {
            validationError = new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "unsafe_archive");
          } else if (!archiveEntryIsSafe(entry.path, entry.type)) {
            validationError = new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "unsafe_archive");
          } else if (isRegularType(entry.type)) {
            declaredBytes += entry.size;
            if (declaredBytes > maxExtractedBytes) {
              validationError = new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_package");
            }
          }
          if (validationError) {
            parser.abort(validationError);
            return;
          }
          entry.resume();
        },
      });
      await pipeline(createReadStream(packagePath), parser);
    } catch (error) {
      if (validationError) throw validationError;
      if (error instanceof PlayerAnalyticsError) throw error;
      if (isStorageError(error)) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_unavailable",
        );
      }
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_package");
    }
  }

  private async extractArchive(packagePath: string, target: string): Promise<void> {
    await this.storage.remove(target);
    try {
      await mkdir(target, { recursive: false });
      await extract({
        file: packagePath,
        cwd: target,
        gzip: true,
        strict: true,
        preservePaths: false,
        unlink: false,
      });
    } catch (error) {
      if (isStorageError(error)) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_unavailable",
        );
      }
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_package");
    }
  }

  private validateManifest(manifest: unknown, generationId: string): void {
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)
      || typeof (manifest as Record<string, unknown>).generationId !== "string") {
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "generation_manifest_invalid");
    }
    if ((manifest as Record<string, unknown>).generationId !== generationId) {
      throw new PlayerAnalyticsError(HttpStatus.CONFLICT, "generation_id_mismatch");
    }
  }

  private result(
    generationId: string,
    state: IngestResult["state"],
    receipt: { packageSha256: string; packageBytes: number },
  ): IngestResult {
    return { ok: true, generationId, state, packageSha256: receipt.packageSha256, packageBytes: receipt.packageBytes };
  }
}
