export const MIX_5V5_MAP_POOL_KEY = "mix_5v5";

export type MatchMapPoolStatus = "ACTIVE" | "RETIRED";

export interface MatchMapPoolEntry {
  readonly key: string;
  readonly displayName: string;
  readonly position: number;
}

export interface MatchMapPool {
  readonly id: string;
  readonly key: string;
  readonly version: number;
  readonly maps: readonly MatchMapPoolEntry[];
}

export interface RawMatchMapPool {
  readonly id: string;
  readonly key: string;
  readonly version: number;
  readonly status: string;
  readonly maps: readonly MatchMapPoolEntry[];
}
