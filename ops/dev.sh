#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — DEV (LOCAL, PERSISTENTE)
# - Sobe dependências (MariaDB via Docker)
# - Aguarda MariaDB ficar pronto
# - Sobe a API com .env.local
# - Não encerra automaticamente (Ctrl+C para parar a API)
# ======================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.local}"

echo "======================================"
echo "HSC AUTH API — DEV LOCAL"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "ENV_FILE: $ENV_FILE"
echo "======================================"

cd "$APP_DIR"

# Guardrail: impedir rodar isso no servidor por engano
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ Este script é apenas para workstation local (APP_DIR parece produção: $APP_DIR)."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Arquivo de ambiente não encontrado: $APP_DIR/$ENV_FILE"
  echo "➡️  Crie o arquivo e tente novamente."
  exit 1
fi

# Validar docker + compose
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker não encontrado."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose plugin não disponível."
  exit 1
fi

# Carrega variáveis no ambiente atual cedo, para usar no wait loop
set -a
. "$ENV_FILE"
set +a

# Subir dependências (se houver compose)
if [[ -f "docker-compose.yml" || -f "compose.yml" ]]; then
  echo "➡️  Subindo dependências (docker compose up -d)..."
  docker compose up -d

  echo "➡️  Aguardando MariaDB ficar pronto..."

  MAX_ATTEMPTS=5
  ATTEMPT=1

  while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
    if docker exec hsc-auth-mariadb mariadb-admin ping \
      -h 127.0.0.1 \
      -u"${DB_USER}" \
      -p"${DB_PASS}" \
      --silent >/dev/null 2>&1; then
      echo "✅ MariaDB pronto."
      break
    fi

    echo "   tentativa $ATTEMPT/$MAX_ATTEMPTS..."
    ATTEMPT=$((ATTEMPT + 1))
    sleep 2
  done

  if [[ $ATTEMPT -gt $MAX_ATTEMPTS ]]; then
    echo "❌ MariaDB não ficou pronto a tempo."
    echo "➡️  Verifique: docker compose ps"
    echo "➡️  Verifique: docker compose logs --tail=100"
    exit 1
  fi
else
  echo "⚠️  Nenhum docker-compose.yml encontrado. Pulando dependências."
fi

echo "➡️  Instalando dependências Node (npm ci)..."
npm ci

echo "➡️  Iniciando API (ENV_FILE=$ENV_FILE)..."

# sobe a API com env já carregado
node index.js