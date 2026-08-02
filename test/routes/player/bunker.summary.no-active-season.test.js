import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSuccessfulScenarioProcess,
  projectContract,
  runScenarioProcess,
} from "../../../test-support/player-bunker/bunker.summary.season-source.helper.js";

test("RED: an old env artifact is rejected when the database has no active Season", async () => {
  const scenario = "no-active-season";
  const result = await runScenarioProcess(scenario);
  const { statusCode, data, artifactReadCalls } =
    parseSuccessfulScenarioProcess(scenario, result);

  assert.equal(statusCode, 200);
  assert.equal(artifactReadCalls, 0);
  assert.deepEqual(projectContract(data, "no_active_season"), {
    statsAvailable: false,
    seasonPlayerPresent: false,
    currentSeason: null,
    expectedNotePresent: true,
  });
});
