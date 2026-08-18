import type { PlayerPresentationReference } from "../player/presentation-reference/player-presentation-reference.contract.js";

export const MATCH_ROOM_CAPACITY = 10;

export type MatchRoomStatus = "FORMING" | "CONFIRMING" | "SETUP" | "CANCELLED";

export type MatchRoomDraftPhase = "PICKING" | "COMPLETED";

export type MatchRoomDraftAssignmentSource =
  | "CAPTAIN"
  | "MANUAL_PICK"
  | "TIMEOUT_AUTO_PICK"
  | "LAST_REMAINING";

export interface MatchRoomDraftAssignmentSnapshot {
  playerAccountId: string;
  team: "A" | "B";
  captain: boolean;
  selectionOrder: number | null;
  source: MatchRoomDraftAssignmentSource;
  pickerPlayerAccountId: string | null;
  assignedAt: Date | string;
}

export interface MatchRoomDraftSnapshot {
  phase: MatchRoomDraftPhase;
  captains: {
    teamAPlayerAccountId: string;
    teamBPlayerAccountId: string;
  };
  firstPickerPlayerAccountId: string;
  currentPickerPlayerAccountId: string | null;
  nextSelectionOrder: number | null;
  pickDeadlineAt: Date | string | null;
  availablePlayerAccountIds: string[];
  assignments: MatchRoomDraftAssignmentSnapshot[];
}

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
    draft: MatchRoomDraftSnapshot | null;
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
      canDraftPick: boolean;
    };
  };
}

export type MatchRoomAggregateSnapshot = MatchRoomSnapshotShape<MatchRoomAggregateParticipantSnapshot>;
export type MatchRoomSnapshot = MatchRoomSnapshotShape<MatchRoomParticipantSnapshot>;
