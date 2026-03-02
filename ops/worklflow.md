**kit de scripts em `hsc-auth-api/ops/`**
- **Manual operacional**:

1. **Por que cada script existe (o ganho)**
2. **Como executar o fluxo local (dev/test)**
3. **Como executar o fluxo de publicação em PROD (release/deploy/rollback)**
4. **Checklist de validação + pontos de falha comuns**

Abaixo vai o **RUNBOOK definitivo** (bem prático e “copiar/colar”), e no final eu deixei os **arquivos completos** (todos) como apêndice.

---

## 0) Filosofia do seu setup (por que isso existe)

Você está migrando de **“implementar direto em produção via SSH”** para um fluxo mínimo e sustentável:

* **Local (workstation)**: você roda a API + MariaDB em Docker, valida endpoints com smoke tests.
* **Release (local)**: você cria uma tag versionada e envia para o Git.
* **Prod (AWS Lightsail)**: o servidor só “puxa a tag” e reinicia o systemd, com smoke tests e rollback.

Isso te dá:

* Reprodutibilidade (qualquer dev roda igual)
* Controle de versões (tag = release)
* Rollback real (voltar a tag anterior)
* Menos “loucura” no SSH

---

# 1) Mapa dos scripts (`ops/`) e quando usar

## Local (workstation / Ubuntu)

* **`ops/dev.sh`** → sobe **MariaDB via Docker** e roda a **API persistente** (fica rodando até Ctrl+C).
* **`ops/deploy-local.sh`** → faz um “deploy local rápido” (instala deps, sobe DB, sobe API, roda smoke, e **encerra** no final).
* **`ops/smoke-local.sh`** → valida endpoints (health + content + admin/schema se tiver ADMIN_KEY).
* **`ops/status.sh`** → imprime diagnóstico (node/npm/git/docker + health).
* **`ops/stop.sh`** → derruba docker-compose local (e opcionalmente apaga volumes/imagens).

## Produção (AWS Lightsail / `/opt/hsc/hsc-auth-api`)

* **`ops/release.sh`** → roda **somente no local**: exige tag `vX.Y.Z`, roda smoke local e faz push da tag.
* **`ops/deploy-auth.sh`** → roda **somente no servidor**: checkout da tag, `npm ci`, restart systemd, smoke endpoints, grava log, lock anti-concorrência, rollback.

---

# 2) Fluxo LOCAL (o que você faz no dia-a-dia)

> **Objetivo**: você codifica local, roda MariaDB em Docker, valida, e só depois “solta tag”.

## 2.1 Pré-requisitos locais (uma vez só)

* Node via `nvm` (você já tem)
* Docker + compose plugin (você já instalou e validou)
* Repo clonado em: `~/work/hsc/hsc-auth-api`

## 2.2 Arquivo `.env.local` (obrigatório)

Você já montou algo assim (padrão):

```env
NODE_ENV=development
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=hsc_auth
DB_USER=hsc
DB_PASS=hsc

ALLOWED_ORIGIN=http://localhost:5173
ADMIN_KEY=dev-admin-key
```

**Regra**:

* Local usa `.env.local`
* Prod usa `.env` no `/opt/hsc/hsc-auth-api`

---

## 2.3 Rodar a API local (modo DEV persistente)

Use quando você quer **programar e testar várias vezes**:

```bash
cd ~/work/hsc/hsc-auth-api
./ops/dev.sh
```

O que acontece:

* Sobe MariaDB via `docker compose up -d`
* Instala deps se necessário
* Roda `node index.js` com `.env.local`
* **Fica rodando** até você dar `Ctrl+C`

Validação:

* em outro terminal:

```bash
curl -fsS http://127.0.0.1:3000/health | cat
```

---

## 2.4 Smoke test local (a qualquer momento)

```bash
cd ~/work/hsc/hsc-auth-api
./ops/smoke-local.sh
```

Valida:

* `/health`
* `/content/news`
* `/content/seasons`
* `/content/seasons/active`
* `/admin/schema` (se `ADMIN_KEY` existir no `.env.local`)

---

## 2.5 “Deploy local rápido” (roda tudo e encerra)

Esse é ótimo pra “check final”:

```bash
cd ~/work/hsc/hsc-auth-api
./ops/deploy-local.sh
```

O que ele faz:

* Sobe DB local via Docker
* `npm ci`
* sobe a API
* espera health
* roda smoke
* **encerra** no final

---

## 2.6 Parar tudo local

Parar containers (mantém dados):

```bash
./ops/stop.sh
```

Parar e apagar volumes (zera banco local):

```bash
./ops/stop.sh --volumes
```

Parar e apagar imagens (raramente necessário):

```bash
./ops/stop.sh --images
```

---

## 2.7 Diagnóstico local (quando algo “parece estranho”)

```bash
./ops/status.sh
```

---

# 3) Fluxo de PUBLICAÇÃO (release local → deploy prod)

## 3.1 Release (sempre no LOCAL)

> O release cria uma tag versionada e garante que **o estado que você vai publicar passa smoke local**.

```bash
cd ~/work/hsc/hsc-auth-api
./ops/release.sh v0.1.12
```

O que ele faz (ganho real):

* valida que é repo git
* impede rodar em produção (guardrail)
* roda `smoke-local.sh` (bloqueia release se falhar)
* cria tag `v0.1.12`
* push da tag

**Resultado**: agora existe uma “versão oficial” que o servidor pode buscar.

---

## 3.2 Deploy em PROD (no AWS Lightsail)

> Você roda isso logado no servidor Lightsail.

**Importante**: você já viu que o deploy deve rodar como `hscadmin`, não como root, para evitar “dubious ownership” do git.

### Deploy normal para uma tag

```bash
sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh v0.1.12
```

### Rollback (volta para a tag anterior salva)

```bash
sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh --rollback
```

O que ele faz (e por que isso é ouro):

* garante host correto (não roda no lugar errado)
* lock anti-concorrência (`flock`) → evita 2 deploys simultâneos
* `git fetch --tags`
* salva “tag anterior” em `/opt/hsc/.deploy-auth-last-tag`
* checkout forçado da tag (detached HEAD)
* `npm ci --omit=dev`
* restart do systemd `hsc-auth-api`
* smoke tests nos endpoints
* grava log em `/var/log/hsc/deploy-auth.log`

---

# 4) “Pegadinhas” reais que você já encontrou (e como lidar)

## 4.1 “dubious ownership” no git

Você viu isso quando rodou como root.

**Regra simples**: deploy sempre como `hscadmin`:

```bash
sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh v0.1.12
```

(Alternativa: configurar `safe.directory`, mas eu prefiro manter o “dono certo” e evitar relaxar segurança do git.)

## 4.2 “Failed to mangle name…”

Isso aconteceu porque você colou comandos que dependiam de variáveis do script (`$SERVICE`, `$STATE_FILE`) **fora do contexto**.

**Regra**: em PROD, você não roda “pedaços do script” manualmente. Você roda o script.

## 4.3 Docker “não encontrado” no local

Você já resolveu instalando Docker e adicionando o user ao grupo docker (ok).

---

# 5) Checklist oficial do seu dia-a-dia (simples e repetível)

## Implementar feature

1. codar local
2. `./ops/dev.sh`
3. `./ops/smoke-local.sh`
4. commit (git)

## Preparar release

5. `./ops/release.sh vX.Y.Z`

## Publicar em prod

6. SSH no Lightsail
7. `sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh vX.Y.Z`

## Se deu ruim

8. `sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/deploy-auth.sh --rollback`

---

# 6) Arquivos completos (como você pediu)

A seguir estão **todos os scripts completos** exatamente como estão nos seus anexos.

## `ops/deploy-auth.sh` (PROD)

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hsc/hsc-auth-api"
SERVICE="hsc-auth-api"
HEALTH_URL="http://127.0.0.1:3000/health"
LOG_DIR="/var/log/hsc"
LOG_FILE="$LOG_DIR/deploy-auth.log"

EXPECTED_HOST="ip-172-26-2-109"
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

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Diretório da aplicação não encontrado: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

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
  echo "❌ Uso: $0 <TAG> | --rollback   (ex: $0 v0.1.12)"
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
```

## `ops/deploy-local.sh` (LOCAL “rápido”)

```bash
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
  echo "❌ docker não encontrado."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose plugin não encontrado (docker compose version falhou)."
  exit 1
fi

# Validar docker-compose.yml
if [[ ! -f docker-compose.yml ]]; then
  echo "❌ docker-compose.yml não encontrado em $APP_DIR"
  exit 1
fi

echo "➡️  Subindo dependências (docker compose up -d)..."
docker compose up -d

# Lint mínimo de DB_PORT (se existir)
DB_PORT="$(grep -m1 '^DB_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n' || true)"
if [[ -n "${DB_PORT:-}" && "$DB_PORT" != "$DEFAULT_DB_PORT_LOCAL" ]]; then
  echo "⚠️  DB_PORT em $ENV_FILE é '$DB_PORT' (esperado '$DEFAULT_DB_PORT_LOCAL' se usar o padrão 3307:3306)."
fi

echo "➡️  Instalando dependências (npm ci)..."
npm ci

echo "➡️  Subindo API local..."
set +e
node -e "require('dotenv').config({path:'$ENV_FILE'}); console.log('env loaded:', process.env.NODE_ENV, process.env.PORT, process.env.DB_HOST, process.env.DB_PORT)"
set -e

export DOTENV_CONFIG_PATH="$ENV_FILE"

# start em background + trap para encerrar ao sair
npm start &
APP_PID="$!"

cleanup() {
  echo "➡️  Encerrando API local (PID=$APP_PID)..."
  kill "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

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

echo "➡️  Smoke local..."
./ops/smoke-local.sh

echo "✅ Local deploy OK!"
echo
echo "API está rodando enquanto este script estiver ativo."
echo "Para manter rodando em outro terminal: execute 'npm start' manualmente."
```

## `ops/dev.sh` (LOCAL persistente)

```bash
#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — DEV (LOCAL, PERSISTENTE)
# - Sobe dependências (MariaDB via Docker)
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
  echo "❌ docker compose plugin não encontrado."
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "❌ docker-compose.yml não encontrado em $APP_DIR"
  exit 1
fi

echo "➡️  Subindo dependências (docker compose up -d)..."
docker compose up -d

echo "➡️  Instalando dependências (npm ci)..."
npm ci

echo "➡️  Rodando API (Ctrl+C para parar)..."
export DOTENV_CONFIG_PATH="$ENV_FILE"
npm start
```

## `ops/smoke-local.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "➡️  Smoke: health"
curl -fsS "$BASE_URL/health" | cat
echo

echo "➡️  Smoke: /content/news"
curl -fsS "$BASE_URL/content/news" >/dev/null

echo "➡️  Smoke: /content/seasons"
curl -fsS "$BASE_URL/content/seasons" >/dev/null

echo "➡️  Smoke: /content/seasons/active"
curl -fsS "$BASE_URL/content/seasons/active" >/dev/null

ADMIN_KEY_ENV="$(grep -m1 '^ADMIN_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n')"
if [[ -n "${ADMIN_KEY_ENV:-}" ]]; then
  echo "➡️  Smoke admin: /admin/schema"
  curl -fsS "$BASE_URL/admin/schema" -H "X-Admin-Key: $ADMIN_KEY_ENV" >/dev/null
else
  echo "⚠️  ADMIN_KEY não encontrado em $ENV_FILE — pulando smoke admin."
fi

echo "✅ Smoke OK"
```

## `ops/status.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/health}"

echo "======================================"
echo "HSC AUTH API — STATUS"
echo "Timestamp (UTC): $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "BASE_URL: $BASE_URL"
echo "======================================"

cd "$APP_DIR"

echo
echo "▶ Runtime"
command -v node >/dev/null 2>&1 && echo "node: $(node -v)" || echo "node: (não encontrado)"
command -v npm  >/dev/null 2>&1 && echo "npm:  $(npm -v)"  || echo "npm:  (não encontrado)"

echo
echo "▶ Git"
if command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '<detached>')"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo '<n/a>')"
  echo "tag:    $(git describe --tags --abbrev=0 2>/dev/null || echo '<none>')"
  echo "dirty:  $(git status --porcelain | wc -l | tr -d ' ') file(s)"
else
  echo "git: (repo não detectado)"
fi

echo
echo "▶ Docker (se disponível)"
if command -v docker >/dev/null 2>&1; then
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" || true
else
  echo "docker: (não encontrado)"
fi

echo
echo "▶ Health"
if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  curl -fsS "$HEALTH_URL" | cat
  echo
else
  echo "health: (falhou) $HEALTH_URL"
fi
```

## `ops/stop.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — STOP (LOCAL)
# - Derruba containers docker-compose
# - Opcional: remove volumes
# - Opcional: remove imagens
# ======================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REMOVE_VOLUMES=false
REMOVE_IMAGES=false

for arg in "$@"; do
  case "$arg" in
    --volumes)
      REMOVE_VOLUMES=true
      ;;
    --images)
      REMOVE_IMAGES=true
      ;;
    *)
      echo "Uso: $0 [--volumes] [--images]"
      exit 1
      ;;
  esac
done

echo "======================================"
echo "HSC AUTH API — STOP LOCAL"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "REMOVE_VOLUMES: $REMOVE_VOLUMES"
echo "REMOVE_IMAGES: $REMOVE_IMAGES"
echo "======================================"

cd "$APP_DIR"

# Guardrail: impedir rodar isso no servidor por engano
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ stop.sh é apenas para workstation local."
  exit 1
fi

ARGS=()
if $REMOVE_VOLUMES; then
  ARGS+=("--volumes")
fi

echo "➡️  Derrubando docker compose..."
docker compose down "${ARGS[@]}"

if $REMOVE_IMAGES; then
  echo "➡️  Removendo imagens do compose (se existirem)..."
  docker compose down --rmi all || true
fi

echo "✅ STOP concluído."
```

## `ops/release.sh` (LOCAL)

```bash
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

# Garantir que smoke script exista
if [[ ! -x "$SMOKE_SCRIPT" ]]; then
  echo "❌ Smoke script não encontrado ou não executável: $SMOKE_SCRIPT"
  echo "➡️  Rode: chmod +x ops/smoke-local.sh"
  exit 1
fi

echo "➡️  Rodando smoke local antes do release..."
"$SMOKE_SCRIPT"

echo "➡️  Criando tag: $TAG"
git tag "$TAG"

echo "➡️  Push da tag: $TAG"
git push origin "$TAG"

echo "✅ Release concluído: $TAG"
```

---

## Próximo passo (como você pediu: 1 micro-bloco por vez)

Como você quer “1 por vez” a partir daqui, o **próximo micro-bloco** que eu recomendo é:

**Micro-bloco #1 — Padronizar “como rodar local” em 1 comando oficial**

* decisão: você quer usar `dev.sh` como padrão diário e `deploy-local.sh` como “check final”? (eu recomendo SIM)
* então a gente só ajusta: documentação + naming + garantir `.env.local` template e `.gitignore`

Se você disser “OK micro-bloco #1”, eu te passo **apenas o passo 1** (bem micro) e a gente segue sequencialmente.
