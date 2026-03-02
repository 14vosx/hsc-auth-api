#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_SCRIPT="$APP_DIR/ops/smoke-local.sh"

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

# Exigir working tree limpa
DIRTY_COUNT="$(git status --porcelain | wc -l | tr -d ' ')"
if [[ "$DIRTY_COUNT" != "0" ]]; then
  echo "❌ Working tree não está limpa ($DIRTY_COUNT mudança(s))."
  echo "➡️  Faça commit/stash antes de criar TAG."
  git status --porcelain
  exit 1
fi

# Validar que tag não existe
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ TAG já existe: $TAG"
  exit 1
fi

# Rodar smoke local obrigatório
if [[ ! -x "$SMOKE_SCRIPT" ]]; then
  echo "❌ Smoke script não encontrado/executável: $SMOKE_SCRIPT"
  echo "➡️  Garanta que existe e rode: chmod +x ops/smoke-local.sh"
  exit 1
fi

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