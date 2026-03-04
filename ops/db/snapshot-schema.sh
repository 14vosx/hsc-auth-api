#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  cat <<'USAGE'
HSC - ops/db/snapshot-schema.sh (read-only)

Gera snapshot auditável do schema REAL do MariaDB (sem dados, sem secrets):
- SELECT VERSION()
- SHOW VARIABLES LIKE 'collation%'
- SHOW CREATE TABLE (todas as BASE TABLEs do schema)
Determinismo: remove "AUTO_INCREMENT=NNN" do DDL.

Uso:
  ops/db/snapshot-schema.sh [--env-file PATH] [--out PATH] [--tag TAG] [--overwrite]

Defaults (DEV):
  --env-file: .env.local (fallback: .env)
  --tag: git describe --tags --always (exige working tree limpa; senão use --tag localtest)
  --out: docs/db/schema_snapshot_<UTC-YYYYMMDD>__<TAG>.md
USAGE
}

ENV_FILE=""
OUT=""
TAG=""
OVERWRITE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-}"; shift 2;;
    --out) OUT="${2:-}"; shift 2;;
    --tag) TAG="${2:-}"; shift 2;;
    --overwrite) OVERWRITE="1"; shift 1;;
    -h|--help) usage; exit 0;;
    *) echo "❌ arg desconhecido: $1" >&2; usage; exit 2;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# escolher env file (DEV-first)
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "$ROOT/.env.local" ]]; then ENV_FILE="$ROOT/.env.local"; else ENV_FILE="$ROOT/.env"; fi
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ env file não encontrado: $ENV_FILE" >&2
  exit 2
fi

# carregar env sem printar
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_PASS="${DB_PASS:-${DB_PASSWORD:-${MYSQL_PASSWORD:-}}}"

: "${DB_HOST:?DB_HOST requerido}"
: "${DB_PORT:?DB_PORT requerido}"
: "${DB_NAME:?DB_NAME requerido}"
: "${DB_USER:?DB_USER requerido}"

command -v mysql >/dev/null 2>&1 || { echo "❌ mysql client não encontrado" >&2; exit 2; }

# tag determinística
if [[ -z "$TAG" ]]; then
  if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
    echo "❌ working tree DIRTY. Passe --tag <TAG> (ex: --tag localtest)." >&2
    exit 2
  fi
  TAG="$(git -C "$ROOT" describe --tags --always)"
fi

SAFE_TAG="$(echo "$TAG" | tr '/ ' '__' | tr -cd 'A-Za-z0-9._-')"
UTC_DATE="$(date -u +%Y%m%d)"

if [[ -z "$OUT" ]]; then
  OUT="$ROOT/docs/db/schema_snapshot_${UTC_DATE}__${SAFE_TAG}.md"
fi
mkdir -p "$(dirname "$OUT")"

CNF="$(mktemp -t hsc-mysql.XXXXXX.cnf)"
TMP_OUT="$(mktemp -t hsc-schema.XXXXXX.md)"
cleanup() { rm -f "$CNF" "$TMP_OUT"; }
trap cleanup EXIT

chmod 600 "$CNF"
# sem heredoc aqui dentro: printf é determinístico e não “quebra” arquivo
printf "[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndatabase=%s\nprotocol=tcp\n" \
  "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" "$DB_NAME" > "$CNF"

mysqlq() {
  mysql --defaults-extra-file="$CNF" --protocol=tcp --connect-timeout=5 "$@"
}

# somente BASE TABLEs (sem views)
mapfile -t TABLES < <(mysqlq --batch --raw --skip-column-names -e \
  "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name;")

declare -A HAS
for t in "${TABLES[@]}"; do HAS["$t"]=1; done
CRITICAL=(users sessions magic_links news seasons admin_audit_log schema_meta active_season)

{
  echo "# HSC — MariaDB Schema Snapshot"
  echo
  echo "- snapshot_date_utc: $(date -u +%F)"
  echo "- tag: $TAG"
  echo "- db: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  echo "- env_file: $(basename "$ENV_FILE")"
  echo

  echo "## Server Version"
  echo '```'
  mysqlq --batch --raw --skip-column-names -e "SELECT VERSION();"
  echo '```'
  echo

  echo "## Collations (collation%)"
  echo '```'
  mysqlq --batch --raw -e "SHOW VARIABLES LIKE 'collation%';" | sed -E 's/[[:space:]]+$//'
  echo '```'
  echo

  echo "## Tables (ordered)"
  echo
  for t in "${TABLES[@]}"; do echo "- \`$t\`"; done
  echo

  echo "## Critical tables check"
  echo
  for ct in "${CRITICAL[@]}"; do
    if [[ -n "${HAS[$ct]:-}" ]]; then
      echo "- [OK] \`$ct\`"
    else
      echo "- [MISSING] \`$ct\`"
    fi
  done
  echo

  echo "## DDL (SHOW CREATE TABLE)"
  echo
  for t in "${TABLES[@]}"; do
    echo "### \`$t\`"
    echo '```sql'
    mysqlq --raw -e "SHOW CREATE TABLE \`$t\`\G" | sed -E 's/ AUTO_INCREMENT=[0-9]+//g'
    echo '```'
    echo
  done
} > "$TMP_OUT"

if [[ -f "$OUT" && "$OVERWRITE" != "1" ]]; then
  if cmp -s "$TMP_OUT" "$OUT"; then
    echo "✅ Snapshot já existe e está idêntico: $OUT"
    exit 0
  fi
  echo "❌ Snapshot já existe e DIFERE: $OUT" >&2
  echo "   Use --overwrite ou --out <novo caminho>." >&2
  exit 2
fi

mv -f "$TMP_OUT" "$OUT"
chmod 644 "$OUT" 2>/dev/null || true
echo "✅ Snapshot gerado: $OUT"
