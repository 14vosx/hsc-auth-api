export const DEFAULT_PLAYER_PROFILE_DISPLAY_NAME =
  "Jogador HSC";

export interface InitialPlayerProfileValues {
  displayName: string;
  slug: string;
}

export function buildInitialPlayerProfileValues(
  playerAccountId: string,
  accountDisplayName: string | null | undefined,
): InitialPlayerProfileValues {
  const compactId =
    playerAccountId
      .replaceAll("-", "")
      .toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compactId)) {
    throw new Error(
      "invalid_player_account_id_for_profile_slug",
    );
  }

  const displayName =
    typeof accountDisplayName === "string"
      ? accountDisplayName.trim()
      : "";

  return {
    displayName:
      displayName ||
      DEFAULT_PLAYER_PROFILE_DISPLAY_NAME,
    slug: `player-${compactId}`,
  };
}

export function isTechnicalPlayerProfileSlug(
  slug: string,
): boolean {
  return /^player-[0-9a-f]{32}$/.test(slug);
}
