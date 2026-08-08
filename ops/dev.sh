#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — DEV LOCAL PERSISTENTE
#
# - Sobe dependências Docker locais
# - Aguarda MariaDB ficar pronta
# - Instala dependências apenas se necessário
# - Compila o runtime NestJS
# - Inicia a API usando ENV_FILE
# - Permanece em foreground até Ctrl+C
# ======================================

APP_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

ENV_FILE="${ENV_FILE:-.env.local}"
DB_WAIT_ATTEMPTS="${DB_WAIT_ATTEMPTS:-30}"

echo "======================================"
echo "HSC AUTH API — DEV LOCAL"
echo "Timestamp (UTC): $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "ENV_FILE: $ENV_FILE"
echo "======================================"

cd "$APP_DIR"

# Guardrail contra execução no host de produção.
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ Script exclusivamente local."
  echo "   APP_DIR parece produção: $APP_DIR"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Arquivo de ambiente não encontrado:"
  echo "   $APP_DIR/$ENV_FILE"
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

echo
echo "➡️  Subindo dependências locais..."
docker compose up -d

echo
echo "➡️  Aguardando MariaDB..."

DB_READY=0

for ATTEMPT in $(seq 1 "$DB_WAIT_ATTEMPTS"); do
  if docker compose exec -T mariadb \
    mariadb-admin ping \
    -h 127.0.0.1 \
    --silent \
    >/dev/null 2>&1
  then
    DB_READY=1
    break
  fi

  echo "   tentativa $ATTEMPT/$DB_WAIT_ATTEMPTS..."
  sleep 1
done

if [[ "$DB_READY" -ne 1 ]]; then
  echo "❌ MariaDB não ficou pronta a tempo."
  echo "➡️  Verifique:"
  echo "   docker compose ps"
  echo "   docker compose logs --tail=100 mariadb"
  exit 1
fi

echo "✅ MariaDB pronta."

echo
if [[ ! -d node_modules ]]; then
  echo "➡️  node_modules ausente; executando npm ci..."
  npm ci
else
  echo "➡️  node_modules presente; npm ci não é necessário."
fi

echo
echo "➡️  Compilando runtime NestJS..."
npm run build:nest

echo
echo "➡️  Iniciando API..."
echo "   Ctrl+C encerra somente o processo Node."
echo "   Para dependências Docker use: ./ops/stop.sh"
echo

ENV_FILE="$ENV_FILE" npm start
