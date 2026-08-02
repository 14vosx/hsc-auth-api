import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const supportDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(supportDirectory, "..", "..");
const runnerPath = path.join(supportDirectory, "bunker.summary.season-source.runner.js");

function sanitizeStderr(value) {
  const sanitized = String(value || "")
    .replace(/\b\d{17}\b/g, "[synthetic-id]")
    .replace(/[A-Za-z]:\\[^\r\n]*/g, "[path]")
    .replace(/\b[A-Z][A-Z0-9_]*=\S+/g, "[env]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return sanitized || "<empty>";
}

function processFailureMessage(scenario, result) {
  return [
    `scenario=${scenario}`,
    `exitCode=${String(result.exitCode)}`,
    `stderr=${sanitizeStderr(result.stderr)}`,
  ].join("; ");
}

export function runScenarioProcess(scenario) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runnerPath, scenario], {
      cwd: repositoryRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      resolve({ exitCode: null, signal: null, stdout, stderr: "process_start_failed" });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

export function parseSuccessfulScenarioProcess(scenario, result) {
  const processIsClean =
    result.exitCode === 0 &&
    result.signal === null &&
    result.stderr === "" &&
    result.stdout !== "" &&
    result.stdout === result.stdout.trim();

  if (!processIsClean) {
    throw new Error(processFailureMessage(scenario, result));
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(processFailureMessage(scenario, result));
  }

  const expectedKeys = "artifactReadCalls,data,statusCode";
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(",") !== expectedKeys
  ) {
    throw new Error(processFailureMessage(scenario, result));
  }

  return parsed;
}

export function publicActiveSeason(activeSeason) {
  return {
    slug: activeSeason.slug,
    name: activeSeason.name,
    status: activeSeason.status,
    scope: {
      startAt: activeSeason.start_at.toISOString(),
      endAt: activeSeason.end_at.toISOString(),
    },
  };
}

export function projectContract(data, expectedNote) {
  return {
    statsAvailable: data.bunker.statsAvailable,
    seasonPlayerPresent: Object.hasOwn(data, "seasonPlayer"),
    currentSeason: data.currentSeason,
    ...(expectedNote
      ? { expectedNotePresent: data.notes.includes(expectedNote) }
      : {}),
  };
}
