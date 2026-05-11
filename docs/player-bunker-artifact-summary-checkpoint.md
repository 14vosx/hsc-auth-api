# Player Bunker Artifact Summary Checkpoint

Checkpoint after #72-#75 for the artifact-backed `GET /player/bunker/summary`
path.

## Context

The ETL owns player stats generation. The Auth API is only the authenticated
gateway that reads a prepared season/player artifact for the authenticated
player.

The Auth API should not calculate Bunker stats. It should expose the artifact
when it is available and return a safe fallback when it is not.

## Config

The route depends on:

```text
PLAYER_BUNKER_ARTIFACT_ROOT
PLAYER_BUNKER_ACTIVE_SEASON_SLUG
```

`PLAYER_BUNKER_ARTIFACT_ROOT` points to the local artifact root. The active
season slug selects the season path inside that root.

## Loader

Loader:

```text
src/services/player-bunker/seasonPlayerArtifact.js
```

`readSeasonPlayerArtifact` is read-only. It performs no HTTP calls and no
writes. It validates inputs, resolves the artifact path under the configured
root, and prevents path escape before reading JSON.

Expected artifact shape is owned by the ETL. The Auth API treats the parsed
artifact as data and does not derive stats from it.

## Route

Route:

```text
GET /player/bunker/summary
```

The route keeps `requirePlayer`. After authentication, it reads the
season/player artifact by the authenticated `req.player.steamid64`.

## Artifact Exists

When the artifact exists and parses successfully:

```text
data.bunker.statsAvailable = true
data.seasonPlayer = <sanitized artifact>
data.currentSeason = artifact.season ?? null
```

The response includes:

```text
season_player_artifact_connected
```

`currentSeason` comes from the artifact. The artifact payload exposed as
`data.seasonPlayer` is sanitized before leaving the Auth API.

## Fallback

For unavailable artifact states, the route returns a non-breaking fallback:

```text
data.bunker.statsAvailable = false
data.currentSeason = null
data.lifetime = null
```

Known fallback reasons:

```text
not_configured
not_found
invalid_json
```

`not_configured` and `not_found` are reported as notes. `invalid_json` and
unexpected read errors are collapsed to:

```text
season_player_artifact_unavailable
```

These states must not break player authentication.

## Smoke

Smoke script:

```text
ops/player-bunker-artifact-summary-smoke.sh
```

The smoke creates a fake ETL fixture under:

```text
$ARTIFACT_ROOT/season/$SEASON_SLUG/player/$TEST_STEAMID64.json
```

It creates a local player session, calls `GET /player/bunker/summary`, and
validates the artifact-backed path, including:

```text
"statsAvailable":true
"seasonPlayer"
season_player_artifact_connected
```

## Security

The Auth API must not expose token, cookie, or hash fields from the artifact.
The route uses a recursive sanitizer for those keys before returning
`data.seasonPlayer`.

The Auth API remains a gateway and does not calculate stats.

## Limitations

- Artifact publication is not in production yet.
- There is no `/var/www` publication path wired here.
- The Portal UI is not expanded for the full `seasonPlayer` payload yet.
- `lifetime` remains `null`.

## Next PRs

- ETL promotes the artifact to official generation and a stable staging path.
- Portal expands the UI to consume `seasonPlayer`.
- Deploy docs/config wire the production envs when this path is ready for prod.
