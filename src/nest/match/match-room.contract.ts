export const MATCH_ROOM_CAPACITY = 10;

export type MatchRoomStatus = "FORMING" | "CANCELLED";

export interface MatchRoomParticipantSnapshot {
  playerAccountId: string;
  joinedAt: Date | string;
}

export interface MatchRoomSnapshot {
  room: {
    id: string;
    status: MatchRoomStatus;
    version: number;
    creator: { playerAccountId: string };
    participantCount: number;
    capacity: 10;
    participants: MatchRoomParticipantSnapshot[];
  };
  viewer: {
    participant: boolean;
    creator: boolean;
    actions: {
      canJoin: boolean;
      canLeave: boolean;
      canCancel: boolean;
    };
  };
}
