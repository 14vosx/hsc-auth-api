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
Cookie-based admin session
Magic link authentication
Admin/content APIs
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

Codex must not make architecture, deployment, release, infrastructure, security, or production-data decisions independently.

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
cookie/session behavior
magic link behavior
admin authorization behavior
```

When adding or changing a response field, route, status code, or validation rule, call it out explicitly.

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
npm start
npm run db:migrate
```

If there are smoke scripts relevant to the task, prefer local smoke scripts only, for example:

```bash
ops/smoke-local.sh
ops/smoke-baseline.sh
```

Do not run deploy/release scripts as validation.

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

## Implementation style

Prefer small, explicit changes.

Avoid broad rewrites.

Keep route handlers thin when possible.

Prefer shared services/utilities for repeated behavior, but do not over-abstract prematurely.

Use existing code style and module patterns.

Do not add dependencies without explicit approval.

## Stop and ask when

Stop and ask the human when the task involves:

```text
architecture decisions
new public API contract
auth/security policy
RBAC policy
cookie/session semantics
database schema tradeoffs
production data
deploy/release
rollback
infra changes
secrets
third-party service configuration
```
