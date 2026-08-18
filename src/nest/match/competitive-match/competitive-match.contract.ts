export const RUNTIME_MATCH_ID_START = 1_000_000;

export interface CompetitiveMatchRosterEntry {
  readonly playerAccountId: string;
  readonly steamid64: string;
  readonly team: "A" | "B";
}

export interface CompetitiveMatchMapSnapshot {
  readonly poolId: string;
  readonly poolKey: string;
  readonly poolVersion: number;
  readonly key: string;
  readonly displayName: string;
}

export interface CompetitiveMatchSnapshot {
  readonly id: string;
  readonly runtimeMatchId: number;
  readonly map: CompetitiveMatchMapSnapshot;
  readonly roster: readonly CompetitiveMatchRosterEntry[];
}

export interface CreateCompetitiveMatchInput {
  readonly id?: string;
  readonly roomId: string;
  readonly map: CompetitiveMatchMapSnapshot;
  readonly roster: readonly CompetitiveMatchRosterEntry[];
}
