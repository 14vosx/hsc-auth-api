// test-support/bootstrap/process-runner.js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runBootstrap } from "../../src/bootstrap/runBootstrap.js";

const supportDir = path.dirname(fileURLToPath(import.meta.url));
const probePath = path.join(supportDir, "application-probe.js");
const probeFileUrl = pathToFileURL(probePath).href;

const mode = process.argv[2] || "normal";

let importApplicationFn = () => import(probeFileUrl);

if (mode === "unknown-error") {
  importApplicationFn = () => {
    throw new Error("SENSITIVE_INTERNAL_DATABASE_CONNECTION_ERROR_12345");
  };
}

runBootstrap({
  importApplicationFn,
}).catch(() => {
  process.exitCode = 1;
});
