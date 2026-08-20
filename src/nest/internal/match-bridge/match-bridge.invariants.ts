import {
  SPEC_VERSION,
  type MatchSpecPlayerV1,
  type MatchSpecV1,
} from "./match-bridge.contract.js";

const STEAMID64_RE = /^\d{17}$/;

export function canonicalizeJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  function sortValue(v: unknown): unknown {
    if (v === null || typeof v !== "object") {
      return v;
    }
    if (Array.isArray(v)) {
      return v.map(sortValue);
    }
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(v as Record<string, unknown>).sort();
    for (const key of keys) {
      sortedObj[key] = sortValue((v as Record<string, unknown>)[key]);
    }
    return sortedObj;
  }

  return JSON.stringify(sortValue(value));
}

export function buildAndValidateMatchSpecV1(params: {
  readonly competitiveMatchId: string;
  readonly runtimeMatchId: number;
  readonly mapPoolKey: string;
  readonly mapPoolVersion: number;
  readonly mapKey: string;
  readonly mapDisplayName: string;
  readonly rosterRows: readonly {
    readonly player_account_id: string;
    readonly steamid64: string;
    readonly steam_personaname?: string | null;
    readonly team: string;
  }[];
}): MatchSpecV1 {
  if (!Number.isSafeInteger(params.runtimeMatchId) || params.runtimeMatchId < 1_000_000) {
    throw new TypeError(
      `Invalid runtimeMatchId: ${params.runtimeMatchId}. Must be safe integer >= 1000000.`
    );
  }

  if (
    !params.mapPoolKey.trim() ||
    params.mapPoolVersion < 1 ||
    !params.mapKey.trim() ||
    !params.mapDisplayName.trim()
  ) {
    throw new TypeError("Invalid map snapshot for competitive match.");
  }

  if (params.rosterRows.length !== 10) {
    throw new TypeError(
      `Expected exactly 10 roster rows for competitive match, got ${params.rosterRows.length}.`
    );
  }

  const teamA: MatchSpecPlayerV1[] = [];
  const teamB: MatchSpecPlayerV1[] = [];
  const playerIds = new Set<string>();
  const steamIds = new Set<string>();

  for (const row of params.rosterRows) {
    const playerId = row.player_account_id?.trim();
    if (!playerId) {
      throw new TypeError("Roster entry has invalid or empty player_account_id.");
    }
    if (playerIds.has(playerId)) {
      throw new TypeError(`Duplicate player_account_id in match roster: ${playerId}`);
    }
    playerIds.add(playerId);

    const steamid64 = row.steamid64?.trim();
    if (!steamid64 || !STEAMID64_RE.test(steamid64)) {
      throw new TypeError(`Invalid steamid64 format in match roster: '${steamid64}'`);
    }
    if (steamIds.has(steamid64)) {
      throw new TypeError(`Duplicate steamid64 in match roster: ${steamid64}`);
    }
    steamIds.add(steamid64);

    const personaname = row.steam_personaname?.trim();
    if (!personaname) {
      throw new TypeError(`Invalid or empty steam_personaname in match roster for player ${playerId}.`);
    }

    const playerEntry: MatchSpecPlayerV1 = {
      playerAccountId: playerId,
      steamid64,
      personaname,
    };

    if (row.team === "A") {
      teamA.push(playerEntry);
    } else if (row.team === "B") {
      teamB.push(playerEntry);
    } else {
      throw new TypeError(`Invalid team assignment '${row.team}' in match roster.`);
    }
  }

  if (teamA.length !== 5 || teamB.length !== 5) {
    throw new TypeError(
      `Expected exactly 5 players on Team A and 5 players on Team B, got ${teamA.length} on A and ${teamB.length} on B.`
    );
  }

  return {
    specVersion: SPEC_VERSION,
    competitiveMatchId: params.competitiveMatchId,
    runtimeMatchId: params.runtimeMatchId,
    map: {
      poolKey: params.mapPoolKey,
      poolVersion: params.mapPoolVersion,
      key: params.mapKey,
      displayName: params.mapDisplayName,
    },
    teams: {
      A: teamA,
      B: teamB,
    },
  };
}
