# AGENTS.md — HSC Auth API

## Project context

This repository contains the HSC Auth API.

Repository:

```text
hsc-auth-api
```

Runtime stack:

```text
Node.js
Express
MySQL/MariaDB via mysql2
SQL migrations
Cookie-based sessions
Magic link authentication for Admin Auth
Steam-first Player Auth
Admin/content APIs
Player-facing Bunker APIs
Steam Profiles cache
```

Current important areas:

```text
src/config
src/db
src/middlewares
src/routes
src/services
src/utils
db/migrations
scripts
ops
docs
```

## Agent role

Codex should act as an implementation assistant for scoped backend tasks.

Codex may edit code, migrations, tests/smokes, and local documentation when the task is explicit.

Codex must not make architecture, deployment, release, infrastructure, security, product, billing, or production-data decisions independently.

## Current product/runtime boundaries

The Auth API currently serves multiple bounded concerns:

```text
Admin Auth
Admin/content APIs
News/Seasons content APIs
Steam Profiles cache
Player Auth
Player Bunker authenticated gateway
```

Admin Auth and Player Auth are separate concepts and must remain separate unless a human explicitly approves a design change.

Do not reuse Admin Auth cookies, guards, tables, or RBAC semantics for Player Auth.

Do not reuse Player Auth cookies or player session semantics for Admin Auth.

## Player Auth / Bunker boundaries

Player Auth is Steam-first.

Known player-facing routes include:

```text
GET  /player/me
GET  /player/bunker/summary
POST /player/auth/logout
GET  /player/auth/steam/start
GET  /player/auth/steam/callback
```

The Player Auth cookie is separate from the admin session cookie.

Known player session cookie:

```text
hsc_player_session
```

Rules:

```text
do not print player cookies
do not print session tokens
do not print token hashes
do not log Steam callback query strings with sensitive values
do not expose session storage internals
do not mix player and admin auth middleware
```

## Player Bunker data boundary

The Auth API is the authenticated gateway for the Player Bunker.

The Auth API may:

```text
authenticate the player
resolve the authenticated SteamID64
read prepared player/season artifacts
sanitize artifact data
return defensive Bunker responses
augment responses with safe identity/profile fields when the source is explicit
```

The Auth API must not:

```text
calculate competitive stats as a new source of truth
recalculate ranking
recalculate score
recalculate prize eligibility
infer Season membership
mutate ETL artifacts
publish ETL artifacts
read MatchZy DB directly
query the CS2 game server directly
```

The ETL owns competitive stats materialization.

The Portal owns presentation.

The Auth API owns authenticated access and safe response shaping.

## Artifact boundary

Player Bunker artifacts are generated outside this repository by `hsc-cs2-etl`.

The Auth API reads artifacts in read-only mode.

Relevant environment variables:

```text
PLAYER_BUNKER_ARTIFACT_ROOT
PLAYER_BUNKER_ACTIVE_SEASON_SLUG
```

Expected artifact layout:

```text
<PLAYER_BUNKER_ARTIFACT_ROOT>/season/<slug>/players-manifest.json
<PLAYER_BUNKER_ARTIFACT_ROOT>/season/<slug>/player/<steamid64>.json
```

Rules:

```text
do not write to artifact root
do not delete artifact files
do not assume artifact root is inside this repo
do not assume artifact root exists in production
do not expose local filesystem paths in public responses unless already part of a safe diagnostic
validate path traversal protections when touching loaders
sanitize artifact payloads before returning them
```

If the artifact is missing, malformed, or not configured, return a safe fallback rather than breaking Player Auth.

## MVP2 Bunker enrichment rules

The next approved product direction is MVP2 — Bunker Melhorado.

Goal:

```text
enrich GET /player/bunker/summary with relevant data already available in the HSC ecosystem
```

Allowed direction:

```text
preserve the existing /player/bunker/summary contract
add fields defensively and retrocompatibly
include Steam avatar/profile when a safe source exists
optionally include a competitiveProfile block from an explicit Static API v2 source
keep seasonPlayer as the Season-scoped artifact payload
keep lifetime/profile data separate from Season data
use short timeouts and safe fallback for optional external/static profile reads
```

Not allowed in MVP2 without explicit approval:

```text
billing
subscriptions
entitlements
subdomain bunker
cutoff from /portal/cs2-next to /portal/cs2
Angular Material migration
new backend service
new ranking formula
new stats database
production deploy
production migrations
Nginx/systemd changes
```

When enriching Bunker responses, clearly distinguish:

```text
player identity
authenticated session state
seasonPlayer stats
competitiveProfile/lifetime stats
derived presentation-only fields
```

## Secret and environment safety

A local `.env` file may exist in this repository.

Treat `.env` as secret material.

Do not:

```text
read .env unless explicitly instructed
print .env contents
copy .env contents
commit .env
rename .env
delete .env
generate examples from real .env values
```

Use `.env.local.example` as the safe reference for environment variable names.

If environment context is required, ask the human to provide sanitized values.

Systemd drop-ins, production `.env` files, Steam API keys, DB credentials, cookies, and callback URLs with tokens are production-sensitive.

## Allowed work

Codex may work on:

```text
Express route handlers
request validation
response shaping
service functions
database access modules
SQL migrations for local review
local smoke scripts
small refactors
bug fixes
documentation updates
```

Codex may inspect:

```text
package.json
index.js
src/**
db/migrations/**
scripts/**
docs/**
ops/*.sh only for understanding
```

For Player Bunker tasks, relevant areas may include:

```text
src/routes/player/**
src/middlewares/player-session**
src/config/playerAuth*
src/config/playerBunker*
src/config/playerSteamAuth*
src/db/player*
src/services/player-bunker/**
docs/player-*
ops/player-*
```

## Forbidden work without explicit approval

Do not change or execute production-sensitive operations without explicit approval.

Forbidden by default:

```text
deploy
release
rollback
tag creation
GitHub Actions changes
systemd changes
Nginx changes
remote SSH commands
production database commands
production migrations
production smoke execution
secret rotation
DNS/TLS/firewall changes
```

Do not modify these files unless the task explicitly asks for it:

```text
.github/workflows/**
ops/deploy-auth.sh
ops/release.sh
ops/deploy-local.sh
docker-compose.yml
```

Read-only review of those files is allowed when relevant.

## API contract rules

Do not change existing API contracts unless explicitly requested.

This includes:

```text
auth routes
admin routes
content routes
health route
player routes
cookie/session behavior
magic link behavior
admin authorization behavior
player authorization behavior
Steam callback behavior
Bunker response shape
```

When adding or changing a response field, route, status code, or validation rule, call it out explicitly.

For `/player/bunker/summary`, preserve backward compatibility unless the human explicitly approves a breaking contract change.

If a requested feature needs a contract decision, stop and ask.

## Database and migration rules

Database changes must be deliberate and reviewable.

When touching migrations:

```text
use a new numbered migration
do not edit applied migrations unless explicitly instructed
preserve backwards compatibility when possible
document the reason for the migration
```

Before finalizing migration-related work, run or propose:

```bash
npm run db:migrate
```

Only run migrations against a local/dev database unless explicitly instructed otherwise.

Do not assume production database access.

For Player Auth tables, do not change account/session/identity semantics without explicit approval.

## Local development

Install dependencies with:

```bash
npm ci
```

Run the API locally with:

```bash
npm start
```

Run migrations locally with:

```bash
npm run db:migrate
```

If Docker is needed for local DB, inspect `docker-compose.yml` first and explain the plan before running commands.

## Validation

For code changes, run the most relevant local validation available.

Baseline commands:

```bash
npm run db:migrate
npm start
```

If there are smoke scripts relevant to the task, prefer local smoke scripts only, for example:

```bash
ops/smoke-local.sh
ops/smoke-baseline.sh
ops/player-bunker-artifact-summary-smoke.sh
```

Do not run deploy/release scripts as validation.

Do not run production smoke tests unless explicitly instructed.

Always report:

```text
commands run
result
warnings/errors
git status --short
git diff --stat
```

## Git workflow

Work on a feature branch.

Before committing, verify:

```bash
git status --short
git diff --check
git diff --stat
```

Do not commit secrets or local `.env`.

Do not alter unrelated files.

Prefer focused commits.

## Documentation

Repository-local docs live in:

```text
docs/**
```

Project-wide canonical documentation lives in the separate `hsc-docs` repository.

Do not assume access to `hsc-docs` from this workspace.

If context from `hsc-docs` is needed, ask the human to provide or open it.

When implementing Player Bunker changes, keep repository-local docs aligned with the actual route/config behavior.

## Implementation style

Prefer small, explicit changes.

Avoid broad rewrites.

Keep route handlers thin when possible.

Prefer shared services/utilities for repeated behavior, but do not over-abstract prematurely.

Use existing code style and module patterns.

Do not add dependencies without explicit approval.

For optional external/static API reads, use explicit config, short timeouts, safe fallback, and tests/smokes that do not require production secrets.

## Stop and ask when

Stop and ask the human when the task involves:

```text
architecture decisions
new public API contract
auth/security policy
RBAC policy
Player Auth policy
cookie/session semantics
Steam identity semantics
database schema tradeoffs
billing/subscriptions/entitlements
production data
deploy/release
rollback
infra changes
secrets
third-party service configuration
```
