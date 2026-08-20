export const LEASE_DURATION_SECONDS = 30;
export const PROTOCOL_VERSION = 1;
export const SPEC_VERSION = 1;

export interface MatchSpecPlayerV1 {
  readonly playerAccountId: string;
  readonly steamid64: string;
  readonly personaname: string;
}

export interface MatchSpecMapV1 {
  readonly poolKey: string;
  readonly poolVersion: number;
  readonly key: string;
  readonly displayName: string;
}

export interface MatchSpecTeamsV1 {
  readonly A: readonly MatchSpecPlayerV1[];
  readonly B: readonly MatchSpecPlayerV1[];
}

export interface MatchSpecV1 {
  readonly specVersion: 1;
  readonly competitiveMatchId: string;
  readonly runtimeMatchId: number;
  readonly map: MatchSpecMapV1;
  readonly teams: MatchSpecTeamsV1;
}

export interface ClaimedCommandTarget {
  readonly serverKey: string;
}

export interface ClaimedCommandPayload {
  readonly commandId: string;
  readonly assignmentId: string;
  readonly commandType: "PREPARE_MATCH";
  readonly attempt: number;
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
  readonly target: ClaimedCommandTarget;
  readonly matchSpec: MatchSpecV1;
}

export interface ClaimCommandResponse {
  readonly ok: true;
  readonly protocolVersion: 1;
  readonly command: ClaimedCommandPayload | null;
}

export interface HeartbeatResponse {
  readonly ok: true;
}

export type CommandOutcome = "SUCCEEDED" | "FAILED";

export interface SubmitResultRequestBody {
  readonly leaseToken: string;
  readonly outcome: CommandOutcome;
  readonly resultCode: string;
  readonly result?: Record<string, unknown> | null;
}

export interface SubmitResultResponse {
  readonly ok: true;
}
