import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { APP_CONFIG, AppConfig } from "../../core/app-config.js";
import { isValidGenerationId, PlayerAnalyticsState } from "./player-analytics-contract.js";
import { PlayerAnalyticsError } from "./player-analytics-error.js";

export function resolveWithinStorageRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_unavailable",
    );
  }
  return resolved;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

@Injectable()
export class PlayerAnalyticsStorageService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get root(): string { return this.config.playerAnalytics.storageRoot; }
  resolve(...segments: string[]): string {
    return resolveWithinStorageRoot(this.root, ...segments);
  }
  uploadPath(id: string): string { return this.resolve("tmp", "uploads", `.upload-${id}.tar.gz.part`); }
  packagePath(generationId: string): string { return this.resolve("tmp", "packages", `${generationId}.tar.gz`); }
  extractPath(id: string): string { return this.resolve("tmp", "extract", `.extract-${id}`); }
  incomingPath(generationId: string): string { return this.resolve("incoming", generationId); }
  acceptedPath(generationId: string): string { return this.resolve("accepted", generationId); }
  rejectedPath(generationId: string): string { return this.resolve("rejected", generationId); }
  deliveryPath(generationId: string): string { return this.resolve("delivery", `${generationId}.json`); }
  newOperationId(): string { return randomUUID(); }

  private contained(target: string): string {
    return resolveWithinStorageRoot(this.root, target);
  }

  async initialize(): Promise<void> {
    try {
      await Promise.all([
        mkdir(this.resolve("tmp", "uploads"), { recursive: true }),
        mkdir(this.resolve("tmp", "packages"), { recursive: true }),
        mkdir(this.resolve("tmp", "extract"), { recursive: true }),
        mkdir(this.resolve("incoming"), { recursive: true }),
        mkdir(this.resolve("accepted"), { recursive: true }),
        mkdir(this.resolve("rejected"), { recursive: true }),
        mkdir(this.resolve("delivery"), { recursive: true }),
        mkdir(this.resolve("tmp", "lifecycle-locks"), { recursive: true }),
        mkdir(this.resolve("tmp", "metadata"), { recursive: true }),
      ]);
    } catch {
      throw new PlayerAnalyticsError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_analytics_storage_unavailable",
      );
    }
  }

  async exists(target: string): Promise<boolean> {
    const containedTarget = this.contained(target);
    try { await lstat(containedTarget); return true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async isRealDirectory(target: string): Promise<boolean> {
    const containedTarget = this.contained(target);
    try {
      const metadata = await lstat(containedTarget);
      return metadata.isDirectory() && !metadata.isSymbolicLink();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async sha256(target: string): Promise<string> {
    const hash = createHash("sha256");
    const packageFile = await open(this.contained(target), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await packageFile.stat();
      if (!metadata.isFile()) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_inconsistent",
        );
      }
      for await (const chunk of packageFile.createReadStream({ autoClose: false })) {
        hash.update(chunk as Buffer);
      }
      return hash.digest("hex");
    } finally {
      await packageFile.close();
    }
  }

  async remove(target: string): Promise<void> {
    const containedTarget = this.contained(target);
    try {
      await rm(containedTarget, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async atomicWrite(target: string, content: string): Promise<void> {
    const destination = this.contained(target);
    const temporary = this.resolve("tmp", "metadata", `.write-${randomUUID()}.part`);
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    let closed = false;
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      closed = true;
      await rename(temporary, destination);
    } finally {
      if (!closed) await handle.close().catch(() => undefined);
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async withLifecycleLock<T>(generationId: string, operation: () => Promise<T>): Promise<T> {
    const lockPath = this.resolve("tmp", "lifecycle-locks", `${generationId}.lock`);
    let lockFile: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        lockFile = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await wait(10);
      }
    }
    if (!lockFile) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_unavailable",
    );
    try {
      return await operation();
    } finally {
      await lockFile.close().catch(() => undefined);
      await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async transition(source: string, destination: string): Promise<void> {
    const from = this.contained(source);
    const to = this.contained(destination);
    if (await this.exists(to)) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
    await rename(from, to);
  }

  async readCurrent(): Promise<string | null> {
    const current = this.resolve("current");
    try {
      const metadata = await lstat(current);
      if (!metadata.isFile() || metadata.nlink !== 1) return null;
      const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.nlink !== 1) return null;
        const raw = await handle.readFile("utf8");
        const marker = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
        return isValidGenerationId(marker) ? marker : null;
      } finally { await handle.close(); }
    } catch (error) {
      if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
      throw error;
    }
  }

  async writeCurrent(generationId: string): Promise<void> {
    await this.atomicWrite(this.resolve("current"), `${generationId}\n`);
  }

  async listAccepted(): Promise<string[]> {
    const entries = await readdir(this.resolve("accepted"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && isValidGenerationId(entry.name))
      .map((entry) => entry.name);
  }

  async listIncoming(): Promise<string[]> {
    const directory = this.resolve("incoming");
    if (!await this.isRealDirectory(directory)) throw new PlayerAnalyticsError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "player_analytics_storage_inconsistent",
    );
    const entries = await readdir(directory, { withFileTypes: true });
    const generations: string[] = [];
    for (const entry of entries) {
      const target = this.resolve("incoming", entry.name);
      if (!isValidGenerationId(entry.name) || !entry.isDirectory()
        || !await this.isRealDirectory(target)) {
        throw new PlayerAnalyticsError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "player_analytics_storage_inconsistent",
        );
      }
      generations.push(entry.name);
    }
    return generations.sort();
  }

  async promoteExtractIfAbsent(extractPath: string, generationId: string): Promise<boolean> {
    const containedExtractPath = this.contained(extractPath);
    const lockPath = this.resolve("tmp", "extract", `.publish-${generationId}.lock`);
    let lockFile: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        lockFile = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await wait(10);
      }
    }
    if (!lockFile) {
      throw new PlayerAnalyticsError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_analytics_storage_unavailable",
      );
    }

    let operationFailed = false;
    try {
      const destination = this.incomingPath(generationId);
      if (await this.exists(destination)) return false;
      try {
        await rename(containedExtractPath, destination);
        return true;
      } catch (error) {
        if (["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) {
          return false;
        }
        throw error;
      }
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      let cleanupError: unknown;
      try { await lockFile.close(); } catch (error) { cleanupError = error; }
      try { await this.remove(lockPath); } catch (error) { cleanupError ??= error; }
      if (!operationFailed && cleanupError) throw cleanupError;
    }
  }

  async readManifest(extractPath: string): Promise<unknown> {
    const manifestPath = resolveWithinStorageRoot(
      this.root,
      this.contained(extractPath),
      "generation-manifest.json",
    );
    let raw: string;
    try { raw = await readFile(manifestPath, "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "generation_manifest_missing");
      }
      if (["EISDIR", "EINVAL"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "generation_manifest_invalid");
      }
      throw error;
    }
    try { return JSON.parse(raw) as unknown; } catch {
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "generation_manifest_invalid");
    }
  }

  async inspectExtractedTree(root: string, maxBytes: number): Promise<void> {
    const containedRoot = this.contained(root);
    let total = 0;
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        const metadata = await lstat(target);
        if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
          throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "unsafe_archive");
        }
        if (metadata.isDirectory()) await visit(target);
        else {
          total += metadata.size;
          if (total > maxBytes) {
            throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_package");
          }
        }
      }
    };
    await visit(containedRoot);
  }

  async status(generationId: string): Promise<PlayerAnalyticsState> {
    if (await this.readCurrent() === generationId) return "current";
    for (const state of ["accepted", "rejected", "incoming"] as const) {
      if (await this.isRealDirectory(this.resolve(state, generationId))) return state;
    }
    return "not_found";
  }
}
