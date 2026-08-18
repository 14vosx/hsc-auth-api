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

export type MatchRoomMapVetoPhase = "BANNING" | "COMPLETED";

export type MatchRoomMapVetoActionSource = "MANUAL_BAN" | "TIMEOUT_AUTO_BAN";

export interface MatchRoomMapVetoActionSnapshot {
  actionOrder: number;
  mapKey: string;
  actorPlayerAccountId: string;
  source: MatchRoomMapVetoActionSource;
  actedAt: Date | string;
}

export interface MatchRoomMapVetoSnapshot {
  phase: MatchRoomMapVetoPhase;
  pool: {
    id: string;
    key: string;
    version: number;
    maps: readonly {
      key: string;
      displayName: string;
      position: number;
    }[];
  };
  firstVetoerPlayerAccountId: string;
  currentVetoerPlayerAccountId: string | null;
  nextActionOrder: number | null;
  actionDeadlineAt: Date | string | null;
  availableMapKeys: string[];
  selectedMapKey: string | null;
  actions: MatchRoomMapVetoActionSnapshot[];
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
    mapVeto: MatchRoomMapVetoSnapshot | null;
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
      canMapVetoBan: boolean;
    };
  };
}

export type MatchRoomAggregateSnapshot = MatchRoomSnapshotShape<MatchRoomAggregateParticipantSnapshot>;
export type MatchRoomSnapshot = MatchRoomSnapshotShape<MatchRoomParticipantSnapshot>;
