import { parseString } from "./helpers.js";

export function buildServerAccessConfig(
  env = process.env,
) {
  return {
    internalApiKey: parseString(
      env.SERVER_ACCESS_INTERNAL_API_KEY,
      "",
    ),
  };
}
