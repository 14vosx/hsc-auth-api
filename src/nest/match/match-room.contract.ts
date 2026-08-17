import type { PlayerPresentationReference } from "../player/presentation-reference/player-presentation-reference.contract.js";

export const MATCH_ROOM_CAPACITY = 10;

export type MatchRoomStatus = "FORMING" | "CONFIRMING" | "SETUP" | "CANCELLED";

export interface MatchRoomAggregateParticipantSnapshot {
  playerAccountId: string;
  joinedAt: Date | string;
  confirmation: {
    confirmed: boolean;
    confirmedAt: Date | string | null;
  };
}

export interface MatchRoomParticipantSnapshot extends MatchRoomAggregateParticipantSnapshot {
  player: PlayerPresentationReference | null;
}

interface MatchRoomSnapshotShape<Participant> {
  room: {
    id: string;
    status: MatchRoomStatus;
    version: number;
    creator: { playerAccountId: string };
    participantCount: number;
    capacity: 10;
    confirmation: {
      round: number;
      startedAt: Date | string;
      deadlineAt: Date | string;
      confirmedCount: number;
    } | null;
    rosterLockedAt: Date | string | null;
    participants: Participant[];
  };
  viewer: {
    participant: boolean;
    creator: boolean;
    actions: {
      canJoin: boolean;
      canLeave: boolean;
      canCancel: boolean;
      canConfirm: boolean;
    };
  };
}

export type MatchRoomAggregateSnapshot = MatchRoomSnapshotShape<MatchRoomAggregateParticipantSnapshot>;
export type MatchRoomSnapshot = MatchRoomSnapshotShape<MatchRoomParticipantSnapshot>;
