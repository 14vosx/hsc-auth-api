import { parseString } from "./helpers.js";

export function buildMatchIngressConfig(env = process.env) {
  const ingestKey = parseString(env.MATCH_INGRESS_KEY, "");
  return {
    configured: ingestKey.length > 0,
    ingestKey,
  };
}
