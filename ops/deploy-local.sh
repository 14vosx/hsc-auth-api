#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — LOCAL DEPLOY / RUN
# Workstation-only (Ubuntu local)
# ======================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.local}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"

# Porta padrão do docker-compose local (se você seguiu o padrão 3307:3306)
DEFAULT_DB_PORT_LOCAL="3307"

echo "======================================"
echo "HSC AUTH API — DEPLOY LOCAL"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "ENV_FILE: $ENV_FILE"
echo "HEALTH_URL: $HEALTH_URL"
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

# Validar presença do docker compose
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker não encontrado. Instale Docker Engine + compose plugin."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose plugin não disponível."
  exit 1
fi

# Subir DB local (se existir compose)
if [[ -f "docker-compose.yml" || -f "compose.yml" ]]; then
  echo "➡️  Subindo dependências (docker compose up -d)..."
  docker compose up -d
else
  echo "⚠️  Nenhum docker-compose.yml encontrado. Pulando subida de DB."
fi

# Instalar deps determinístico
echo "➡️  Instalando dependências (npm ci)..."
npm ci

# Iniciar API local
echo "➡️  Subindo API local..."
# Passa ENV_FILE para o Node ler o env correto (seu index.js deve usar process.env.ENV_FILE)
ENV_FILE="$ENV_FILE" npm start &
APP_PID=$!

cleanup() {
  echo
  echo "➡️  Encerrando API local (PID=$APP_PID)..."
  kill "$APP_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Aguardar health subir
echo "➡️  Aguardando health responder..."
for i in {1..40}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

echo "➡️  Health (raw):"
curl -fsS "$HEALTH_URL" | cat
echo

# Smoke checks básicos
echo "➡️  Smoke: /content/news"
curl -fsS "http://127.0.0.1:3000/content/news" >/dev/null

echo "➡️  Smoke: /content/seasons"
curl -fsS "http://127.0.0.1:3000/content/seasons" >/dev/null

echo "➡️  Smoke: /content/seasons/active"
curl -fsS "http://127.0.0.1:3000/content/seasons/active" >/dev/null

# Smoke admin (se ADMIN_KEY existir no ENV_FILE)
ADMIN_KEY_ENV="$(grep -m1 '^ADMIN_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n')"
if [[ -n "${ADMIN_KEY_ENV:-}" ]]; then
  echo "➡️  Smoke admin: /admin/schema"
  curl -fsS "http://127.0.0.1:3000/admin/schema" -H "X-Admin-Key: $ADMIN_KEY_ENV" >/dev/null
else
  echo "⚠️  ADMIN_KEY não encontrado em $ENV_FILE — pulando smoke admin."
fi

echo "✅ Local deploy OK!"
echo "======================================"
echo "API está rodando enquanto este script estiver ativo."
echo "Para manter rodando em outro terminal: execute 'npm start' manualmente."
echo "======================================"

# Mantém o processo ativo (pra você ver logs). Ctrl+C para sair.
wait "$APP_PID"