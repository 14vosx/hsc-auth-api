// test-support/bootstrap/application-probe.js
export const topLevelProbedVar = process.env.PROBE_VAR ?? null;

export function startApplication(config) {
  const result = {
    ok: true,
    topLevelProbedVar,
    runtime: {
      port: config.runtime.port,
    },
    playerBunker: {
      artifactRoot: config.playerBunker.artifactRoot,
      activeSeasonSlug: config.playerBunker.activeSeasonSlug,
      staticApiBaseUrl: config.playerBunker.staticApiBaseUrl,
      staticApiTimeoutMs: config.playerBunker.staticApiTimeoutMs,
    },
  };
  process.stdout.write(JSON.stringify(result));
  return result;
}
