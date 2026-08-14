import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../core/app-config.js";
import { PlayerAnalyticsEventPublisherService } from "../internal/player-analytics/player-analytics-event-publisher.service.js";
import { PlayerAnalyticsStorageService } from "../internal/player-analytics/player-analytics-storage.service.js";

export interface PlayerAnalyticsReconciliationSummary {
  readonly scanned: number;
  readonly published: number;
  readonly skipped: number;
  readonly failed: number;
}

@Injectable()
export class PlayerAnalyticsReconciliationService implements OnModuleDestroy {
  private readonly logger = new Logger(PlayerAnalyticsReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private started = false;
  private stopping = false;
  private fatalResolve!: () => void;
  private readonly fatal = new Promise<void>((resolve) => { this.fatalResolve = resolve; });

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly storage: PlayerAnalyticsStorageService,
    private readonly publisher: PlayerAnalyticsEventPublisherService,
  ) {}

  async reconcileOnce(): Promise<PlayerAnalyticsReconciliationSummary> {
    const generationIds = await this.storage.listIncoming();
    const summary = { scanned: generationIds.length, published: 0, skipped: 0, failed: 0 };
    for (const generationId of generationIds) {
      try {
        const result = await this.publisher.publishGenerationReceivedIfEligible(generationId);
        if (result === "published") summary.published += 1;
        else summary.skipped += 1;
      } catch {
        summary.failed += 1;
        this.logger.warn(`Player Analytics reconciliation failed: ${generationId}`);
      }
    }
    return summary;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    try {
      await this.storage.initialize();
      await this.reconcileOnce();
      this.scheduleNext();
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  stop(): void {
    this.stopping = true;
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  waitForFatal(): Promise<void> { return this.fatal; }

  onModuleDestroy(): void { this.stop(); }

  private scheduleNext(): void {
    if (this.stopping || !this.started) return;
    this.timer = setTimeout(() => { void this.runPeriodic(); }, this.config.playerAnalytics.reconciliationIntervalMs);
    this.timer.unref();
  }

  private async runPeriodic(): Promise<void> {
    this.timer = undefined;
    try {
      await this.reconcileOnce();
      this.scheduleNext();
    } catch {
      if (!this.stopping) this.fatalResolve();
    }
  }
}
