export type MatchMapPoolErrorCode =
  | "match_map_pool_not_found"
  | "match_map_pool_invariant_violation";

export class MatchMapPoolError extends Error {
  constructor(readonly code: MatchMapPoolErrorCode) {
    super(code);
    this.name = "MatchMapPoolError";
  }
}
