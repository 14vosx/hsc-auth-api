import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";

it("worker module graph não importa AppModule, HTTP, Server Access, Bunker ou DB", async () => {
  const source = await readFile("src/nest/player-analytics-worker/player-analytics-worker.module.ts", "utf8");
  expect(source).not.toContain("AppModule");
  expect(source).not.toContain("Controller");
  expect(source).not.toContain("ServerAccess");
  expect(source).not.toContain("Bunker");
  expect(source).not.toContain("Database");
});

it("worker usa application context sem HTTP listen", async () => {
  const source = await readFile("src/nest/player-analytics-worker/startPlayerAnalyticsWorker.ts", "utf8");
  expect(source).toContain("createApplicationContext");
  expect(source).not.toContain("NestFactory.create(");
  expect(source).not.toContain(".listen(");
});
