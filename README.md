# HSC Auth API

API central de autenticação, identidade, Membership, conteúdo, administração e Match Domain do ecossistema HSC.

A aplicação usa NestJS 11 + TypeScript strict, MariaDB/MySQL e SQL migrations sem ORM.

## Papel no ecossistema

A Auth API é autoridade de:

- Admin Auth e RBAC;
- Player Auth;
- PlayerAccount;
- Steam identity linking;
- Player Profile;
- Membership;
- conteúdo dinâmico;
- Player Bunker gateway;
- Server Access;
- Central Match Domain;
- ServerResource / ServerAssignment;
- protocolo interno do HSC Match Bridge.

Ela não é:

- o Portal Angular;
- o Backoffice Angular;
- o ETL competitivo;
- o servidor CS2;
- o MatchZy;
- o Match Bridge;
- o Match Edge.

## Stack

```text
Node.js 22
NestJS 11
TypeScript strict
ES Modules
MariaDB / MySQL
mysql2
SQL migrations
Vitest
```

## Fronteiras principais

```text
Conta ≠ método de autenticação ≠ profile ≠ membership
```

O SteamID64 nunca é aceito como identidade autodeclarada. O vínculo Steam é comprovado via Steam OpenID.

O ETL continua sendo autoridade de cálculo competitivo/analytics.

O Portal continua sendo autoridade de experiência/apresentação.

## Central Match Domain

O domínio atual suporta:

```text
FORMING
→ CONFIRMING
→ SETUP
→ READY
→ PROVISIONING
```

Também existe `CANCELLED`.

### Formation / Confirmation

- capacidade fixa 10;
- creator ocupa o primeiro slot;
- elegibilidade baseada em conta, Steam vinculada e Membership;
- uma sala ativa por jogador;
- confirmação autoritativa com deadline.

### Captain Draft

O snapshot inclui:

- capitães Team A/B;
- picker atual;
- ordem;
- deadline;
- jogadores disponíveis;
- assignments;
- origem/timestamp das escolhas.

### Map Veto

O snapshot inclui:

- map pool congelada;
- mapas;
- vetoer atual;
- deadline;
- mapas disponíveis;
- histórico de bans;
- mapa selecionado.

### CompetitiveMatch

Depois de Draft + Veto:

- roster é congelado;
- SteamID64 é congelado;
- mapa é congelado;
- `runtime_match_id >= 1_000_000`;
- MatchRoom entra em `READY`.

### Server Assignment

O allocator Central:

- seleciona ServerResource livre;
- seleciona MatchRoom READY FIFO;
- cria ServerAssignment;
- cria `PREPARE_MATCH`;
- avança `READY → PROVISIONING`.

## HSC Match Bridge Protocol

Endpoints internos:

```text
POST /internal/match-bridge/heartbeat
POST /internal/match-bridge/commands/claim
POST /internal/match-bridge/commands/:commandId/result
```

Princípios:

- credencial dedicada;
- `bridgeNodeKey` derivado pelo Central;
- claim com lease;
- terminal idempotente;
- Match Spec v1 congelado.

Um `PREPARE_MATCH` bem-sucedido exige:

```text
status = SUCCEEDED
resultCode = PREPARED
```

## Checkpoint atual do Match

O fluxo real abaixo foi validado em produção:

```text
READY
→ ServerAssignment
→ PREPARE_MATCH
→ HSC Match Bridge
→ MatchZy
→ PREPARED
```

A fronteira atual termina em `PROVISIONING + PREPARED`.

Ainda não estão implementados:

```text
PREPARED → JOINABLE
JOINABLE → IN_GAME
IN_GAME → FINISHED
assignment release pós-reset
```

Não inventar `JOINABLE` em consumers antes da implementação Central.

## Server Access V2

Contrato contextual:

```text
POST /internal/server-access/v2/authorize
```

A decisão considera:

- Steam identity;
- PlayerAccount;
- Membership efetivo;
- ServerResource;
- ServerAssignment;
- CompetitiveMatch roster;
- fase da MatchRoom.

Em `PROVISIONING`, o roster correto ainda recebe:

```text
authorized = false
reason = server_preparing
```

Isso é intencional até existir JOINABLE.

## Desenvolvimento local

```bash
npm ci
cp .env.local.example .env.local
ENV_FILE=.env.local npm run db:migrate
npm run build:nest
ENV_FILE=.env.local npm start
```

## Validação

```bash
npm test
npm run build:nest
ENV_FILE=.env.local npm run smoke:local
git diff --check
```

`npm run build` não é o comando canônico deste repo. Use `npm run build:nest`.

## Migrations

- ficam em `db/migrations/`;
- não editar migrations já aplicadas;
- migrations não rodam no startup HTTP;
- não introduzir ORM sem decisão explícita.

## Deploy

O fluxo produtivo canônico é:

```text
release tag
→ deploy manual por comando
→ migrations/preflight
→ restart service
→ smoke
```

GitHub Actions não é o mecanismo canônico de deploy da Auth API.

## Segurança

Nunca registrar:

- `.env`;
- cookies;
- tokens;
- SMTP credentials;
- DB URL;
- internal keys;
- Bridge raw credential;
- SSH private keys.

## Checkpoint de release

- produção validada em `v0.7.1`;
- G3-C4 mergeado e aceito fisicamente.