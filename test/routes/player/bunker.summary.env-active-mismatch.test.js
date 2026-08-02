import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSuccessfulScenarioProcess,
  projectContract,
  publicActiveSeason,
  runScenarioProcess,
} from "../../../test-support/player-bunker/bunker.summary.season-source.helper.js";

const activeSeason = {
  slug: "season-new",
  name: "Season New",
  status: "active",
  start_at: new Date("2026-08-01T12:00:00.000Z"),
  end_at: new Date("2026-09-01T12:00:00.000Z"),
};

test("RED: an env artifact from an old Season is rejected in favor of the active database Season", async () => {
  const scenario = "env-active-mismatch";
  const result = await runScenarioProcess(scenario);
  const { statusCode, data, artifactReadCalls } =
    parseSuccessfulScenarioProcess(scenario, result);

  assert.equal(statusCode, 200);
  assert.equal(artifactReadCalls, 0);
  assert.deepEqual(projectContract(data, "season_artifact_slug_mismatch"), {
    statsAvailable: false,
    seasonPlayerPresent: false,
    currentSeason: publicActiveSeason(activeSeason),
    expectedNotePresent: true,
  });
});
