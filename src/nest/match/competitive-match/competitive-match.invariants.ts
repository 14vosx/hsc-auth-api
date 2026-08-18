import {
  RUNTIME_MATCH_ID_START,
  type CompetitiveMatchMapSnapshot,
  type CompetitiveMatchRosterEntry,
  type CompetitiveMatchSnapshot,
} from "./competitive-match.contract.js";

export function validateCompetitiveMatchSetupInvariants(params: {
  readonly roomStatus: string;
  readonly draftCompleted: boolean;
  readonly vetoCompleted: boolean;
  readonly selectedMapKey: string | null;
  readonly mapMetadata: {
    readonly poolId: string;
    readonly poolKey: string;
    readonly poolVersion: number;
    readonly mapKey: string;
    readonly displayName: string;
  } | null;
  readonly participantAccountIds: readonly string[];
  readonly draftAssignments: readonly {
    readonly playerAccountId: string;
    readonly team: string;
  }[];
  readonly steamIdentities: readonly {
    readonly playerAccountId: string;
    readonly steamid64: string;
  }[];
}): {
  readonly map: CompetitiveMatchMapSnapshot;
  readonly roster: readonly CompetitiveMatchRosterEntry[];
} {
  if (params.roomStatus !== "SETUP") {
    throw new TypeError("Match room must be in SETUP to materialize competitive match.");
  }
  if (!params.draftCompleted) {
    throw new TypeError("Draft must be COMPLETED to materialize competitive match.");
  }
  if (!params.vetoCompleted) {
    throw new TypeError("Map veto must be COMPLETED to materialize competitive match.");
  }
  if (!params.selectedMapKey) {
    throw new TypeError("Map veto selected map key must be defined.");
  }
  if (!params.mapMetadata) {
    throw new TypeError("Map metadata must exist in the frozen pool for selected map.");
  }
  if (params.mapMetadata.mapKey !== params.selectedMapKey) {
    throw new TypeError("Map metadata does not match selected map key.");
  }
  if (params.mapMetadata.poolVersion < 1) {
    throw new TypeError("Map pool version must be positive integer >= 1.");
  }

  // Exactly 10 active participants
  if (params.participantAccountIds.length !== 10) {
    throw new TypeError(`Expected exactly 10 active participants, got ${params.participantAccountIds.length}.`);
  }
  const participantSet = new Set(params.participantAccountIds);
  if (participantSet.size !== 10) {
    throw new TypeError("Active participants must be distinct player accounts.");
  }

  // Exactly 10 draft assignments
  if (params.draftAssignments.length !== 10) {
    throw new TypeError(`Expected exactly 10 draft assignments, got ${params.draftAssignments.length}.`);
  }

  // Every participant has exactly 1 assignment and no outsiders
  const assignedPlayerIds = new Set<string>();
  let teamACount = 0;
  let teamBCount = 0;

  for (const assignment of params.draftAssignments) {
    if (!participantSet.has(assignment.playerAccountId)) {
      throw new TypeError(`Draft assignment player ${assignment.playerAccountId} is not an active participant.`);
    }
    if (assignedPlayerIds.has(assignment.playerAccountId)) {
      throw new TypeError(`Duplicate draft assignment for player ${assignment.playerAccountId}.`);
    }
    assignedPlayerIds.add(assignment.playerAccountId);

    if (assignment.team === "A") teamACount++;
    else if (assignment.team === "B") teamBCount++;
    else throw new TypeError(`Invalid draft team ${assignment.team}.`);
  }

  if (teamACount !== 5 || teamBCount !== 5) {
    throw new TypeError(`Expected 5 Team A and 5 Team B players, got ${teamACount} A and ${teamBCount} B.`);
  }

  // Steam identities
  const steamMap = new Map<string, string>();
  for (const identity of params.steamIdentities) {
    if (typeof identity.steamid64 !== "string" || !/^\d{17}$/.test(identity.steamid64)) {
      throw new TypeError(`Invalid steamid64 format for player ${identity.playerAccountId}.`);
    }
    steamMap.set(identity.playerAccountId, identity.steamid64);
  }

  const distinctSteamIds = new Set<string>();
  const roster: CompetitiveMatchRosterEntry[] = [];

  for (const assignment of params.draftAssignments) {
    const steamid64 = steamMap.get(assignment.playerAccountId);
    if (!steamid64) {
      throw new TypeError(`Player ${assignment.playerAccountId} does not have a linked Steam identity.`);
    }
    if (distinctSteamIds.has(steamid64)) {
      throw new TypeError(`Duplicate SteamID64 detected: ${steamid64}.`);
    }
    distinctSteamIds.add(steamid64);

    roster.push({
      playerAccountId: assignment.playerAccountId,
      steamid64,
      team: assignment.team as "A" | "B",
    });
  }

  if (roster.length !== 10 || distinctSteamIds.size !== 10) {
    throw new TypeError("Expected exactly 10 distinct Steam IDs in roster.");
  }

  return {
    map: {
      poolId: params.mapMetadata.poolId,
      poolKey: params.mapMetadata.poolKey,
      poolVersion: params.mapMetadata.poolVersion,
      key: params.mapMetadata.mapKey,
      displayName: params.mapMetadata.displayName,
    },
    roster,
  };
}

export function validateCompetitiveMatchRuntimeSnapshot(snapshot: {
  readonly id: string;
  readonly runtimeMatchId: number | string;
  readonly map: CompetitiveMatchMapSnapshot;
  readonly roster: readonly CompetitiveMatchRosterEntry[];
}): CompetitiveMatchSnapshot {
  const runtimeMatchId = Number(snapshot.runtimeMatchId);
  if (!Number.isSafeInteger(runtimeMatchId) || runtimeMatchId < RUNTIME_MATCH_ID_START) {
    throw new TypeError(`Invalid runtimeMatchId: ${snapshot.runtimeMatchId}. Must be safe integer >= ${RUNTIME_MATCH_ID_START}.`);
  }

  if (snapshot.roster.length !== 10) {
    throw new TypeError(`Invalid competitive match roster length: ${snapshot.roster.length}. Expected 10.`);
  }

  return {
    id: snapshot.id,
    runtimeMatchId,
    map: snapshot.map,
    roster: snapshot.roster,
  };
}
