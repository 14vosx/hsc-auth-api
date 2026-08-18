export type MatchRoomErrorCode =
  | "already_in_active_room"
  | "already_in_room"
  | "room_not_found"
  | "room_not_joinable"
  | "room_full"
  | "not_room_participant"
  | "creator_must_cancel_room"
  | "not_room_creator"
  | "room_not_cancellable"
  | "room_not_confirmable"
  | "confirmation_window_closed"
  | "steam_identity_not_linked"
  | "player_account_disabled"
  | "membership_required"
  | "membership_inactive"
  | "membership_suspended"
  | "membership_expired"
  | "membership_cancelled"
  | "room_not_drafting"
  | "not_draft_picker"
  | "draft_target_not_available"
  | "draft_window_closed"
  | "room_not_vetoing"
  | "not_map_vetoer"
  | "map_veto_target_not_available"
  | "map_veto_window_closed";

export class MatchRoomError extends Error {
  constructor(readonly code: MatchRoomErrorCode) {
    super(code);
    this.name = "MatchRoomError";
  }
}
