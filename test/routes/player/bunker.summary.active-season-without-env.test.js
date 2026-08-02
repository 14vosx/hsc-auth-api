import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSuccessfulScenarioProcess,
  projectContract,
  publicActiveSeason,
  runScenarioProcess,
} from "../../../test-support/player-bunker/bunker.summary.season-source.helper.js";

const activeSeason = {
  slug: "season-active",
  name: "Season Active",
  status: "active",
  start_at: new Date("2026-08-01T12:00:00.000Z"),
  end_at: new Date("2026-09-01T12:00:00.000Z"),
};

test("RED: activeSeason.slug selects the matching artifact when the env slug is absent", async () => {
  const scenario = "active-season-without-env";
  const result = await runScenarioProcess(scenario);
  const { statusCode, data, artifactReadCalls } =
    parseSuccessfulScenarioProcess(scenario, result);

  assert.equal(statusCode, 200);
  assert.equal(artifactReadCalls, 1);
  assert.deepEqual(projectContract(data), {
    statsAvailable: true,
    seasonPlayerPresent: true,
    currentSeason: publicActiveSeason(activeSeason),
  });
  assert.deepEqual(data.seasonPlayer.stats, { matches: 9, wins: 4 });
  assert.equal(data.seasonPlayer.season.slug, "season-active");
  assert.equal(data.seasonPlayer.season.name, "Artifact Season");
  assert.equal(data.currentSeason.slug, "season-active");
  assert.equal(data.currentSeason.name, "Season Active");
  assert.equal(data.currentSeason.status, "active");
  assert.notDeepEqual(data.seasonPlayer.season, data.currentSeason);
});
