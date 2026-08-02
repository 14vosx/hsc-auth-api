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

test("RED: an artifact whose embedded slug differs from the active Season is rejected", async () => {
  const scenario = "artifact-slug-mismatch";
  const result = await runScenarioProcess(scenario);
  const { statusCode, data, artifactReadCalls } =
    parseSuccessfulScenarioProcess(scenario, result);

  assert.equal(statusCode, 200);
  assert.equal(artifactReadCalls, 1);
  assert.deepEqual(projectContract(data, "season_artifact_slug_mismatch"), {
    statsAvailable: false,
    seasonPlayerPresent: false,
    currentSeason: publicActiveSeason(activeSeason),
    expectedNotePresent: true,
  });
});
