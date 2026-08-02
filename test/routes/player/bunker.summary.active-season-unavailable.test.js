import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSuccessfulScenarioProcess,
  projectContract,
  runScenarioProcess,
} from "../../../test-support/player-bunker/bunker.summary.season-source.helper.js";

test("RED: an artifact is rejected when the active Season query fails", async () => {
  const scenario = "active-season-unavailable";
  const result = await runScenarioProcess(scenario);
  const { statusCode, data, artifactReadCalls } =
    parseSuccessfulScenarioProcess(scenario, result);

  assert.equal(statusCode, 200);
  assert.equal(artifactReadCalls, 0);
  assert.deepEqual(projectContract(data, "active_season_unavailable"), {
    statsAvailable: false,
    seasonPlayerPresent: false,
    currentSeason: null,
    expectedNotePresent: true,
  });
});
