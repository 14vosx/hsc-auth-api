import mysql from "mysql2/promise";

export function createSteamProfilesRepo(dbConfig) {
  async function withConn(fn) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  async function getProfilesBySteamIds(steamids) {
    if (!Array.isArray(steamids) || steamids.length === 0) return new Map();

    return withConn(async (conn) => {
      const profiles = new Map();
      const chunkSize = 100;

      for (let offset = 0; offset < steamids.length; offset += chunkSize) {
        const chunk = steamids.slice(offset, offset + chunkSize);
        const placeholders = chunk.map(() => "?").join(", ");
        const [rows] = await conn.execute(
          `
          SELECT steamid64, personaname, profile_url, avatar_url,
            avatar_medium_url, avatar_full_url, community_visibility_state,
            profile_state, last_logoff, fetched_at
          FROM steam_profiles
          WHERE steamid64 IN (${placeholders})
          `,
          chunk,
        );

        for (const row of rows) {
          profiles.set(row.steamid64, row);
        }
      }

      return profiles;
    });
  }

  async function upsertProfiles(profiles) {
    if (!Array.isArray(profiles) || profiles.length === 0) return;

    await withConn(async (conn) => {
      await conn.beginTransaction();

      try {
        for (const profile of profiles) {
          await conn.execute(
            `
            INSERT INTO steam_profiles (
              steamid64, personaname, profile_url, avatar_url,
              avatar_medium_url, avatar_full_url, community_visibility_state,
              profile_state, last_logoff, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              personaname = VALUES(personaname),
              profile_url = VALUES(profile_url),
              avatar_url = VALUES(avatar_url),
              avatar_medium_url = VALUES(avatar_medium_url),
              avatar_full_url = VALUES(avatar_full_url),
              community_visibility_state = VALUES(community_visibility_state),
              profile_state = VALUES(profile_state),
              last_logoff = VALUES(last_logoff),
              fetched_at = VALUES(fetched_at)
            `,
            [
              profile.steamid64,
              profile.personaname,
              profile.profile_url,
              profile.avatar_url,
              profile.avatar_medium_url,
              profile.avatar_full_url,
              profile.community_visibility_state,
              profile.profile_state,
              profile.last_logoff,
              profile.fetched_at,
            ],
          );
        }

        await conn.commit();
      } catch (err) {
        try {
          await conn.rollback();
        } catch {}
        throw err;
      }
    });
  }

  return {
    getProfilesBySteamIds,
    upsertProfiles,
  };
}
