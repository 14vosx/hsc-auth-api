#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hsc/hsc-auth-api"
SERVICE="hsc-auth-api"
HEALTH_URL="http://127.0.0.1:3000/health"
LOG_DIR="/var/log/hsc"
LOG_FILE="$LOG_DIR/deploy-auth.log"

mkdir -p "$LOG_DIR"

# log: tudo que sai no terminal também vai para arquivo
exec > >(tee -a "$LOG_FILE") 2>&1

echo "======================================"
echo "HSC AUTH API DEPLOY"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "======================================"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Diretório da aplicação não encontrado: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

STATE_FILE="/opt/hsc/.deploy-auth-last-tag"

if [[ "${1:-}" == "--rollback" ]]; then
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "❌ Rollback solicitado, mas não existe state file: $STATE_FILE"
    exit 1
  fi
  TAG="$(cat "$STATE_FILE" | tr -d '\n')"
  echo "↩️  Rollback para tag anterior: $TAG"
else
  TAG="${1:-}"
fi

echo "➡️  Commit atual:"
git rev-parse --short HEAD || true

if [[ -z "${TAG:-}" ]]; then
  echo "❌ Uso: $0 <TAG> | --rollback   (ex: $0 v0.1.4)"
  exit 1
fi

echo "➡️  Target tag: $TAG"
echo "➡️  Fetch tags..."
git fetch --tags --prune

PREV_TAG="$(git tag --points-at HEAD 2>/dev/null | head -n 1 || true)"
if [[ -z "${PREV_TAG:-}" ]]; then
  PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
fi

if [[ -n "${PREV_TAG:-}" && "${PREV_TAG}" != "${TAG}" ]]; then
  echo "$PREV_TAG" | sudo tee "$STATE_FILE" >/dev/null
  echo "📝 Saved last tag: $PREV_TAG -> $STATE_FILE"
else
  echo "📝 Skip saving last tag (prev='${PREV_TAG:-<none>}' target='${TAG}')"
fi

echo "➡️  Checkout forçado da tag (detached HEAD)..."
git checkout -f "$TAG"

echo "➡️  Instalando dependências (npm ci)..."
npm ci --omit=dev

echo "➡️  Reiniciando serviço: $SERVICE"
sudo /usr/bin/systemctl restart "$SERVICE"

echo "➡️  Aguardando 2s..."
sleep 2

echo "➡️  Status do serviço:"
sudo /usr/bin/systemctl status "$SERVICE" --no-pager -l | sed -n '1,12p'

echo "➡️  Testando health endpoint..."
if ! curl -fsS "$HEALTH_URL" | grep '"ok":true' >/dev/null; then
  echo "❌ Health check falhou."
  echo "➡️  Últimos logs do serviço (journalctl):"
  sudo /usr/bin/journalctl -u "$SERVICE" -n 80 --no-pager
  exit 1
fi

echo "➡️  Smoke: /content/news ..."
if ! curl -fsS "http://127.0.0.1:3000/content/news" | grep '"ok":true' >/dev/null; then
  echo "❌ Smoke /content/news falhou."
  exit 1
fi

echo "➡️  Smoke: /content/seasons ..."
if ! curl -fsS "http://127.0.0.1:3000/content/seasons" | grep '"ok":true' >/dev/null; then
  echo "❌ Smoke /content/seasons falhou."
  exit 1
fi

echo "➡️  Smoke: /content/seasons/active ..."
if ! curl -fsS "http://127.0.0.1:3000/content/seasons/active" | grep '"ok":true' >/dev/null; then
  echo "❌ Smoke /content/seasons/active falhou."
  exit 1
fi

echo "➡️  Smoke: /admin/schema ..."
ADMIN_KEY_ENV="$(grep -m1 '^ADMIN_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r\n')"
if [[ -z "$ADMIN_KEY_ENV" ]]; then
  echo "❌ ADMIN_KEY não encontrado em .env (necessário para smoke admin)."
  exit 1
fi
if ! curl -fsS "http://127.0.0.1:3000/admin/schema" -H "X-Admin-Key: $ADMIN_KEY_ENV" | grep '"ok":true' >/dev/null; then
  echo "❌ Smoke admin (/admin/schema) falhou."
  exit 1
fi

echo "✅ Deploy concluído com sucesso!"
echo "Log: $LOG_FILE"
echo "======================================"
