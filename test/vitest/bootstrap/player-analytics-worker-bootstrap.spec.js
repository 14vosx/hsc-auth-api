import { expect, it, vi } from "vitest";
import { runPlayerAnalyticsWorkerBootstrap } from "../../../src/bootstrap/runPlayerAnalyticsWorkerBootstrap.js";

function deferred() {
  let resolve;
  return { promise: new Promise((done) => { resolve = done; }), resolve: () => resolve() };
}

it("bootstrap - startup failure é sanitizada e define exitCode", async () => {
  const logger = { error: vi.fn() }; const processRef = { exitCode: 0 };
  await runPlayerAnalyticsWorkerBootstrap({
    loadEnvFn: vi.fn(), buildAppConfigFn: vi.fn(() => ({})),
    importWorkerFn: vi.fn(async () => ({ startPlayerAnalyticsWorker: vi.fn().mockRejectedValue(new Error("amqp://secret")) })),
    logger, processRef,
  });
  expect(logger.error).toHaveBeenCalledWith("[player-analytics-worker] startup failed");
  expect(processRef.exitCode).toBe(1);
});

it("bootstrap - fatal runtime fecha context best-effort e define exitCode", async () => {
  const fatal = deferred(); const close = vi.fn().mockResolvedValue(undefined);
  const logger = { error: vi.fn() }; const processRef = { exitCode: 0 };
  await runPlayerAnalyticsWorkerBootstrap({
    loadEnvFn: vi.fn(), buildAppConfigFn: vi.fn(() => ({})),
    importWorkerFn: vi.fn(async () => ({ startPlayerAnalyticsWorker: vi.fn().mockResolvedValue({ fatal: fatal.promise, close }) })),
    logger, processRef,
  });
  fatal.resolve();
  await fatal.promise;
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(logger.error).toHaveBeenCalledWith("[player-analytics-worker] fatal runtime failure");
  expect(processRef.exitCode).toBe(1);
});
