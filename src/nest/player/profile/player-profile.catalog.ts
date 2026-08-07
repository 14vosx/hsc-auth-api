export const PLAYER_PROFILE_ROLE_OPTIONS = [
  {
    key: "awper",
    label: "AWPer",
  },
  {
    key: "rifler",
    label: "Rifler",
  },
  {
    key: "entry_fragger",
    label: "Entry Fragger",
  },
  {
    key: "lurker",
    label: "Lurker",
  },
  {
    key: "support",
    label: "Support",
  },
  {
    key: "igl",
    label: "IGL",
  },
  {
    key: "anchor",
    label: "Anchor",
  },
] as const;

export type PlayerProfilePreferredRole =
  (typeof PLAYER_PROFILE_ROLE_OPTIONS)[number]["key"];

const PLAYER_PROFILE_ROLE_KEYS = new Set<string>(
  PLAYER_PROFILE_ROLE_OPTIONS.map((option) => option.key),
);

export function isPlayerProfilePreferredRole(
  value: string,
): value is PlayerProfilePreferredRole {
  return PLAYER_PROFILE_ROLE_KEYS.has(value);
}

/**
 * Current maps selectable through official CS2 matchmaking/playlists.
 *
 * We preserve Valve/HSC canonical map identifiers instead of display labels.
 * Community rotations can change without a database migration.
 */
export const PLAYER_PROFILE_MAP_OPTIONS = [
  {
    key: "de_ancient",
    label: "Ancient",
  },
  {
    key: "de_anubis",
    label: "Anubis",
  },
  {
    key: "de_cache",
    label: "Cache",
  },
  {
    key: "de_cbble",
    label: "Cobblestone",
  },
  {
    key: "de_dust2",
    label: "Dust II",
  },
  {
    key: "de_inferno",
    label: "Inferno",
  },
  {
    key: "de_mirage",
    label: "Mirage",
  },
  {
    key: "de_nuke",
    label: "Nuke",
  },
  {
    key: "de_overpass",
    label: "Overpass",
  },
  {
    key: "de_train",
    label: "Train",
  },
  {
    key: "de_vertigo",
    label: "Vertigo",
  },
  {
    key: "cs_italy",
    label: "Italy",
  },
  {
    key: "cs_office",
    label: "Office",
  },
  {
    key: "de_boulder",
    label: "Boulder",
  },
  {
    key: "de_fachwerk",
    label: "Fachwerk",
  },
  {
    key: "cs_shelter",
    label: "Shelter",
  },
  {
    key: "de_debris",
    label: "Debris",
  },
  {
    key: "de_eldorado",
    label: "El Dorado",
  },
  {
    key: "de_poseidon",
    label: "Poseidon",
  },
] as const;

export type PlayerProfilePreferredMap =
  (typeof PLAYER_PROFILE_MAP_OPTIONS)[number]["key"];

const PLAYER_PROFILE_MAP_KEYS = new Set<string>(
  PLAYER_PROFILE_MAP_OPTIONS.map((option) => option.key),
);

export function isPlayerProfilePreferredMap(
  value: string,
): value is PlayerProfilePreferredMap {
  return PLAYER_PROFILE_MAP_KEYS.has(value);
}

export const PLAYER_PROFILE_VISIBILITIES = [
  "private",
  "public",
] as const;

export type PlayerProfileVisibility =
  (typeof PLAYER_PROFILE_VISIBILITIES)[number];

const PLAYER_PROFILE_VISIBILITY_KEYS = new Set<string>(
  PLAYER_PROFILE_VISIBILITIES,
);

export function isPlayerProfileVisibility(
  value: string,
): value is PlayerProfileVisibility {
  return PLAYER_PROFILE_VISIBILITY_KEYS.has(value);
}

export const PLAYER_PROFILE_RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "email",
  "hsc",
  "login",
  "logout",
  "me",
  "member",
  "members",
  "membership",
  "player",
  "players",
  "profile",
  "profiles",
  "settings",
  "staff",
  "steam",
  "support",
]);
