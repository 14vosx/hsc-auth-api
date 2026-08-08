#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hsc/hsc-auth-api"
SERVICE="hsc-auth-api"
HEALTH_URL="http://127.0.0.1:3000/health"
LOG_DIR="/var/log/hsc"
LOG_FILE="$LOG_DIR/deploy-auth.log"

EXPECTED_HOST="${DEPLOY_EXPECTED_HOST:-ip-172-26-13-181}"
LOCK_FILE="/tmp/hsc-auth-deploy.lock"
STATE_FILE="/opt/hsc/.deploy-auth-last-tag"

mkdir -p "$LOG_DIR"

# log: tudo que sai no terminal também vai para arquivo
exec > >(tee -a "$LOG_FILE") 2>&1

echo "======================================"
echo "HSC AUTH API DEPLOY"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "======================================"

# Guard: roda somente no host correto (evita acidentes)
if [[ "$(hostname)" != "$EXPECTED_HOST" ]]; then
  echo "❌ Este script só pode rodar no host: $EXPECTED_HOST (atual: $(hostname))"
  exit 1
fi

# Garantir flock disponível
if ! command -v flock >/dev/null 2>&1; then
  echo "❌ 'flock' não encontrado. Instale 'util-linux' (Ubuntu): sudo apt-get install -y util-linux"
  exit 1
fi

# Lock anti-concorrência: 1 deploy por vez
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "❌ Deploy já em execução (lock: $LOCK_FILE)."
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ Diretório da aplicação não encontrado: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

# .env parametrizável (default: .env)
ENV_FILE="${ENV_FILE:-.env}"

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

# Salvar a tag anterior para rollback (somente quando fizer sentido)
if [[ -n "${PREV_TAG:-}" && "${PREV_TAG}" != "${TAG}" ]]; then
  echo "$PREV_TAG" | sudo tee "$STATE_FILE" >/dev/null
  echo "📝 Saved last tag: $PREV_TAG -> $STATE_FILE"
else
  echo "📝 Skip saving last tag (prev='${PREV_TAG:-<none>}' target='${TAG}')"
fi

echo "➡️  Checkout forçado da tag (detached HEAD)..."
git checkout -f "$TAG"

echo "➡️  Instalando dependências..."
npm ci

HAS_BUILD_NEST="$(node -e '
try {
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  console.log(Boolean(pkg && pkg.scripts && pkg.scripts["build:nest"]) ? "true" : "false");
} catch {
  console.log("false");
}
')"

if [[ "$HAS_BUILD_NEST" == "true" ]]; then
  echo "🔨 Compilando runtime NestJS (npm run build:nest)..."
  npm run build:nest
else
  echo "ℹ️  Tag anterior ao runtime NestJS (build:nest ausente). Pulando build para compatibilidade de rollback."
fi

echo "➡️  Limpando dependências de desenvolvimento (npm prune)..."
npm prune --omit=dev

echo "➡️  Validando configuração da tag antes das migrations..."

HAS_DEPLOY_PREFLIGHT="$(node -e '
try {
  const pkg = JSON.parse(
    require("fs").readFileSync(
      "package.json",
      "utf8",
    ),
  );

  console.log(
    Boolean(
      pkg &&
      pkg.scripts &&
      pkg.scripts["preflight:deploy"]
    )
      ? "true"
      : "false",
  );
} catch {
  console.log("false");
}
')"

if [[ "$HAS_DEPLOY_PREFLIGHT" == "true" ]]; then
  echo "➡️  Pre-flight moderno: npm run preflight:deploy"

  if ! ENV_FILE="$ENV_FILE"     npm run preflight:deploy
  then
    echo "❌ Configuração da aplicação inválida para deploy."
    echo "➡️  Migrations e restart NÃO foram executados."
    exit 1
  fi
else
  echo "ℹ️  Tag anterior ao preflight:deploy."
  echo "➡️  Pulando pre-flight moderno para compatibilidade de rollback."
fi

echo "➡️  Rodando migrations do banco..."
ENV_FILE="$ENV_FILE" npm run db:migrate

echo "➡️  Reiniciando serviço: $SERVICE"
sudo /usr/bin/systemctl restart "$SERVICE"

echo "➡️  Aguardando 2s..."
sleep 2

echo "➡️  Status do serviço:"
sudo /usr/bin/systemctl status "$SERVICE" --no-pager -l | sed -n '1,12p'

echo "➡️  Executando smoke pós-deploy..."

HAS_SMOKE_DEPLOY="$(node -e '
try {
  const pkg = JSON.parse(
    require("fs").readFileSync(
      "package.json",
      "utf8",
    ),
  );

  console.log(
    Boolean(
      pkg &&
      pkg.scripts &&
      pkg.scripts["smoke:deploy"]
    )
      ? "true"
      : "false",
  );
} catch {
  console.log("false");
}
')"

if [[ "$HAS_SMOKE_DEPLOY" == "true" ]]; then
  echo "➡️  Smoke moderno: npm run smoke:deploy"

  if ! DEPLOY_SMOKE_BASE_URL="http://127.0.0.1:3000"     npm run smoke:deploy
  then
    echo "❌ Smoke pós-deploy falhou."
    echo "➡️  Últimos logs do serviço (journalctl):"
    sudo /usr/bin/journalctl       -u "$SERVICE"       -n 80       --no-pager
    exit 1
  fi
else
  echo "ℹ️  Tag anterior ao smoke:deploy."
  echo "➡️  Executando fallback legado mínimo e read-only."

  if ! curl -fsS "$HEALTH_URL"     | grep '"ok":true' >/dev/null
  then
    echo "❌ Legacy health check falhou."
    sudo /usr/bin/journalctl       -u "$SERVICE"       -n 80       --no-pager
    exit 1
  fi

  if ! curl -fsS     "http://127.0.0.1:3000/content/news"     | grep '"ok":true' >/dev/null
  then
    echo "❌ Legacy smoke /content/news falhou."
    exit 1
  fi

  if ! curl -fsS     "http://127.0.0.1:3000/content/seasons"     | grep '"ok":true' >/dev/null
  then
    echo "❌ Legacy smoke /content/seasons falhou."
    exit 1
  fi

  if ! curl -fsS     "http://127.0.0.1:3000/content/seasons/active"     | grep '"ok":true' >/dev/null
  then
    echo "❌ Legacy smoke /content/seasons/active falhou."
    exit 1
  fi
fi

echo "✅ Deploy concluído com sucesso!"
echo "Log: $LOG_FILE"
echo "======================================"