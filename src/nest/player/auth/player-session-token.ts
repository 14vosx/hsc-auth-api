import {
  createHash,
  randomUUID,
} from "node:crypto";

export interface PlayerSessionTokenMaterial {
  sessionId: string;
  rawToken: string;
  tokenHash: string;
}

export function createPlayerSessionTokenMaterial():
  PlayerSessionTokenMaterial {
  const sessionId = randomUUID();
  const rawToken = randomUUID();
  const tokenHash = createHash("sha256")
    .update(rawToken)
    .digest("hex");

  return {
    sessionId,
    rawToken,
    tokenHash,
  };
}
