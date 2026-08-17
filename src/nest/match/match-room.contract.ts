export const MATCH_ROOM_CAPACITY = 10;

export type MatchRoomStatus = "FORMING" | "CONFIRMING" | "SETUP" | "CANCELLED";

export interface MatchRoomParticipantSnapshot {
  playerAccountId: string;
  joinedAt: Date | string;
  confirmation: {
    confirmed: boolean;
    confirmedAt: Date | string | null;
  };
}

export interface MatchRoomSnapshot {
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
    participants: MatchRoomParticipantSnapshot[];
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
