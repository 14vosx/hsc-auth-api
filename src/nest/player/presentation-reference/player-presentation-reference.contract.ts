export interface PlayerPresentationReference {
  steam: {
    steamId64: string;
    personaname: string | null;
    avatarMediumUrl: string | null;
  };
  profile: {
    slug: string;
  } | null;
}

export interface PlayerPresentationReferencesResolution {
  references: Record<string, PlayerPresentationReference>;
  missing: string[];
}
