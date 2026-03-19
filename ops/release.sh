#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_SCRIPT="$APP_DIR/ops/smoke-local.sh"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env.local}"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "❌ Uso: $0 <TAG>   (ex: $0 v0.1.12)"
  exit 1
fi

if [[ "$TAG" != v* ]]; then
  echo "❌ TAG inválida. Use prefixo 'v' (ex: v0.1.12)."
  exit 1
fi

cd "$APP_DIR"

echo "======================================"
echo "HSC AUTH API — RELEASE"
echo "Timestamp (UTC): $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "TAG: $TAG"
echo "======================================"

# Guardrail: não rodar em produção
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ Não rode release.sh no servidor. Release é local."
  exit 1
fi

# Validar git repo
if [[ ! -d .git ]]; then
  echo "❌ Este diretório não é um repositório git: $APP_DIR"
  exit 1
fi

# (novo) garantir branch main
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "❌ Release só pode ser gerada a partir do branch 'main' (atual: $BRANCH)"
  exit 1
fi

# (novo) garantir workspace limpo
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree suja. Commit/stash antes de gerar release."
  git status --porcelain
  exit 1
fi

# (novo) garantir main sincronizado com origin
git fetch origin main --tags
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "❌ Seu main local não está igual ao origin/main. Rode: git pull --ff-only"
  exit 1
fi

# (novo) impedir tag duplicada
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "❌ Tag já existe: $TAG"
  exit 1
fi

# Rodar smoke local obrigatório
if [[ ! -x "$SMOKE_SCRIPT" ]]; then
  echo "❌ Smoke script não encontrado/executável: $SMOKE_SCRIPT"
  echo "➡️  Garanta que existe e rode: chmod +x ops/smoke-local.sh"
  exit 1
fi

if [[ ! -f "$APP_DIR/$LOCAL_ENV_FILE" ]]; then
  echo "❌ ENV local não encontrado: $APP_DIR/$LOCAL_ENV_FILE"
  exit 1
fi

echo "➡️  Rodando migrations locais..."
ENV_FILE="$LOCAL_ENV_FILE" npm run db:migrate


echo "➡️  Rodando smoke local (obrigatório)..."
"$SMOKE_SCRIPT"

echo "➡️  Criando tag anotada: $TAG"
git tag -a "$TAG" -m "release: $TAG"

echo "➡️  Push da tag..."
git push origin "$TAG"

echo "✅ Release concluído: $TAG"
echo "➡️  Próximo passo (produção):"
echo "   sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh $TAG"
echo "======================================"