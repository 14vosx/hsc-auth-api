#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — STOP LOCAL DEPENDENCIES
#
# Para somente as dependências Docker
# deste projeto.
#
# Não encerra processos Node iniciados
# separadamente.
# ======================================

APP_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

REMOVE_VOLUMES="${REMOVE_VOLUMES:-false}"
REMOVE_IMAGES="${REMOVE_IMAGES:-false}"

usage() {
  cat <<'USAGE'
Usage:
  ./ops/stop.sh [options]

Options:
  --volumes, -v   Remove volumes do Compose.
  --images        Remove imagens locais do Compose.
  --help, -h      Exibe esta ajuda.

Default:
  docker compose down --remove-orphans

Observação:
  Este script para apenas dependências Docker locais.
  Processos Node iniciados separadamente não são encerrados.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --volumes|-v)
      REMOVE_VOLUMES="true"
      ;;
    --images)
      REMOVE_IMAGES="true"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "❌ Opção desconhecida: $1" >&2
      echo >&2
      usage >&2
      exit 2
      ;;
  esac

  shift
done

case "$REMOVE_VOLUMES" in
  true|false) ;;
  *)
    echo "❌ REMOVE_VOLUMES deve ser true ou false." >&2
    exit 2
    ;;
esac

case "$REMOVE_IMAGES" in
  true|false) ;;
  *)
    echo "❌ REMOVE_IMAGES deve ser true ou false." >&2
    exit 2
    ;;
esac

echo "======================================"
echo "HSC AUTH API — STOP LOCAL DEPENDENCIES"
echo "Timestamp (UTC): $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "REMOVE_VOLUMES: $REMOVE_VOLUMES"
echo "REMOVE_IMAGES: $REMOVE_IMAGES"
echo "======================================"

cd "$APP_DIR"

# Guardrail contra execução no host de produção.
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ Script exclusivamente local."
  echo "   APP_DIR parece produção: $APP_DIR"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker não encontrado."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose não disponível."
  exit 1
fi

if [[ ! -f docker-compose.yml && ! -f compose.yml ]]; then
  echo "❌ Arquivo Compose não encontrado."
  exit 1
fi

DOWN_ARGS=(
  down
  --remove-orphans
)

if [[ "$REMOVE_VOLUMES" == "true" ]]; then
  DOWN_ARGS+=(--volumes)
fi

if [[ "$REMOVE_IMAGES" == "true" ]]; then
  DOWN_ARGS+=(--rmi local)
fi

echo
echo "➡️  Parando dependências Docker locais..."

docker compose "${DOWN_ARGS[@]}"

echo
echo "✅ Dependências Docker locais paradas."
echo "ℹ️  Processos Node externos não foram alterados."
echo "======================================"
