# HSC Auth API — Local Smoke

## Objetivo

O smoke local canônico valida o runtime NestJS atual do `hsc-auth-api`.

Ele confirma que a aplicação consegue:

- compilar;
- iniciar com configuração local;
- conectar ao MariaDB local;
- expor contratos HTTP essenciais;
- preservar fronteiras de autenticação;
- aplicar proteções de segurança críticas;
- responder de forma fail-closed no contrato interno de Server Access.

O smoke é pequeno, não destrutivo e orientado ao estado atual da aplicação.

Ele substitui os antigos scripts shell criados durante as fases de fundação, skeleton de Player Auth e integração inicial do Player Bunker.

## Entry point

Comando canônico:

```bash
ENV_FILE=.env.local npm run smoke:local
```

Script:

```text
scripts/smoke-local.js
```

O comando npm executa primeiro:

```text
npm run build:nest
```

e depois inicia o smoke.

Não é necessário iniciar previamente `npm start`.

## Arquitetura

O smoke:

1. carrega o ambiente local;
2. constrói a configuração real da aplicação;
3. recusa banco fora de `localhost` ou `127.0.0.1`;
4. aplica somente overrides efêmeros necessários ao smoke;
5. inicia a aplicação NestJS real via `startApplication()`;
6. usa uma porta TCP efêmera;
7. executa requests HTTP com o `fetch` nativo do Node.js 22;
8. encerra a aplicação NestJS ao final, inclusive em caso de falha.

Não existe servidor HTTP alternativo, aplicação Express paralela ou mock do runtime.

## Pré-requisitos

Ambiente local canônico:

```text
Windows
WSL 2
Ubuntu 24.04 LTS
Node.js 22 via NVM
Docker Desktop
Docker Desktop integrado à distro Ubuntu-24.04
MariaDB local em 127.0.0.1:3307
```

Quando Docker Desktop já é o runtime Docker do ambiente, não instalar Docker Engine separadamente dentro do WSL.

Confirmar integração:

```bash
docker version
```

Subir o MariaDB local:

```bash
docker compose up -d mariadb
```

Confirmar estado:

```bash
docker compose ps mariadb
```

O compose do projeto publica:

```text
127.0.0.1:3307
```

## Schema local

Antes do smoke, o banco local deve estar alinhado às migrations do checkout atual.

Executar:

```bash
ENV_FILE=.env.local npm run db:migrate
```

Uma segunda execução sem migrations pendentes deve retornar:

```text
✅ No pending migrations.
```

Migrations não são executadas automaticamente pelo smoke.

## Cobertura mínima

### Health e database readiness

Valida:

```text
GET /health
```

Esperado:

```text
HTTP 200
ok = true
service = hsc-auth-api
db.ready = true
```

O smoke também confirma CORS para a origem local usada durante sua execução.

### Conteúdo público

Valida:

```text
GET /content/news
GET /content/seasons
```

Ambas devem responder HTTP `200`.

### Fronteiras Player

Sem sessão player válida, valida HTTP `401` em:

```text
GET /player/account
GET /player/membership
GET /player/profile/me
GET /player/bunker/summary
```

Isso confirma que superfícies player-facing autenticadas não ficam disponíveis sem `hsc_player_session` válido.

### Fronteiras administrativas

Sem autenticação administrativa, valida HTTP `401` nos contratos administrativos de player accounts e memberships.

O smoke não precisa de sessão administrativa nem de `ADMIN_KEY` real.

### CSRF

Valida que login por e-mail sem `Origin` é rejeitado:

```text
POST /player/auth/email/login
```

Esperado:

```text
HTTP 403
error = csrf_origin_required
```

### Rate limiting

Executa tentativas locais controladas de login com um endereço sintético.

Ao exceder o limite esperado:

```text
HTTP 429
error = rate_limited
Retry-After > 0
```

Nenhum endereço de e-mail real é utilizado.

### Steam OpenID state

Valida:

```text
GET /player/auth/steam/start
```

Confirma que:

- existe redirect OpenID;
- é emitido `hsc_player_steam_login_state`;
- o state possui o formato criptográfico esperado;
- `openid.return_to` contém o mesmo state;
- callback sem o cookie browser-bound é rejeitado.

O smoke não autentica uma conta Steam real.

### Server Access

Valida:

```text
POST /internal/server-access/authorize
```

O smoke gera uma credencial interna aleatória somente em memória.

Essa credencial:

- não vem de `.env`;
- não é persistida;
- não é impressa;
- deixa de existir ao final do processo.

Com chave inválida:

```text
HTTP 401
error = invalid_internal_key
```

Com a chave efêmera válida e um SteamID64 sintético não vinculado:

```json
{
  "ok": true,
  "authorized": false,
  "reason": "steam_identity_not_linked"
}
```

Esse cenário confirma comportamento fail-closed sem criar conta, identidade ou membership.

## Segurança e não mutação

O smoke não deve:

- apontar para banco remoto;
- acessar produção;
- imprimir `.env`;
- imprimir credenciais;
- imprimir cookies de sessão;
- imprimir tokens;
- imprimir hashes;
- persistir a credencial efêmera de Server Access;
- criar player account;
- criar membership;
- criar sessão player diretamente no banco;
- alterar profile;
- realizar upload;
- escrever artifact do Bunker;
- executar migration automaticamente;
- executar deploy, release ou rollback.

## O que o smoke mínimo não substitui

Continuam cobertos pelas suítes automatizadas direcionadas:

- registration e email verification;
- login por e-mail;
- password reset;
- email linking;
- Steam linking;
- callback Steam OpenID verificado;
- criação e revogação de sessão;
- account summary autenticado;
- profile privado e member-visible profile;
- profile update;
- avatar e banner;
- membership lifecycle;
- Admin Player Accounts;
- account disable/enable;
- todas as decisões de Server Access;
- sanitização e leitura positiva dos artifacts do Bunker;
- Steam Profiles;
- uploads administrativos.

Integrações externas reais devem permanecer fora do smoke mínimo.

## Resultado esperado

Execução bem-sucedida:

```text
HSC Auth API local smoke
Mode: ephemeral NestJS application + local DB

✓ health + local database readiness
✓ public content routes
✓ player authentication boundaries
✓ admin player-management boundaries
✓ CSRF rejection on session-changing email login
✓ email login rate limit
✓ Steam login browser-bound state
✓ internal Server Access credential boundary
✓ internal Server Access fail-closed decision

✓ SMOKE_LOCAL_OK
```

Exit status:

```text
0
```

## Diagnóstico

### `ECONNREFUSED` em `127.0.0.1:3307`

Confirmar:

```bash
docker version
docker compose ps mariadb
```

Quando necessário:

```bash
docker compose up -d mariadb
```

### `db.ready = false`

Primeiro confirmar conectividade.

Depois confirmar migrations:

```bash
ENV_FILE=.env.local npm run db:migrate
```

`schema_bootstrap_failed` é um estado sanitizado de database readiness e não deve ser interpretado automaticamente como migration pendente.

## Validação ampla

Quando a mudança justificar todos os gates:

```bash
npm run build:nest
npm test
ENV_FILE=.env.local npm run smoke:local
```

Validação do diff:

```bash
git diff --check
git diff --stat
git status --short
```

## Produção

Este smoke é exclusivamente local.

Ele não autoriza implicitamente:

- smoke de produção;
- migrations de produção;
- deploy;
- release;
- rollback.

Operações de produção exigem aprovação explícita.
