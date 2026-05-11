# Player Auth/Bunker local smoke runbook

## 1. Objetivo

Este runbook registra um smoke local para o skeleton de Player Auth/Bunker no
`hsc-auth-api`.

O objetivo e validar o estado atual sem Steam OpenID real e sem login Steam
funcional. O smoke autenticado cria uma sessao player local apenas contra DB
local/dev para validar os endpoints autenticados e o logout.

## 2. Estado atual integrado

Estado esperado apos as PRs #53 a #68:

- #53: plano local de Player Auth Steam-first.
- #54: schema de Player Auth com contas, identidades Steam e sessoes player.
- #55: skeleton de middleware, cookie e helpers de sessao player.
- #56: skeleton das rotas Steam Auth player-facing.
- #57: endpoint autenticado `GET /player/me`.
- #58: endpoint autenticado `GET /player/bunker/summary`.
- #60: script local de smoke de rotas Player Auth/Bunker skeleton.
- #61: verificacao do callback Steam OpenID por Direct Verification.
- #64: emissao de sessao player apos callback Steam verificado.
- #67: rota de logout player-facing para revogar a sessao atual e limpar o
  cookie player.
- #68: smoke autenticado cobrindo o ciclo local com logout.

Com `PLAYER_STEAM_AUTH_ENABLED=true`, o Steam Auth agora valida callback OpenID
via Direct Verification contra o endpoint OpenID da Steam. Quando o callback e
verificado, a API resolve ou cria a conta player, cria uma row em
`player_sessions`, seta o cookie `hsc_player_session` e retorna
`authenticated: true`.

O ciclo local validado tambem cobre logout: uma sessao player valida acessa
`/player/me` e `/player/bunker/summary`, chama `POST /player/auth/logout`, tem
a sessao revogada, e o mesmo cookie deixa de autenticar nos endpoints
protegidos.

## 3. Ambiente local

Use ambiente local/dev. Nao rode estes comandos contra producao.

Arquivo de ambiente esperado:

```bash
ENV_FILE=.env.local
```

DB local esperado:

```text
127.0.0.1:3307
```

Aplicar migrations em DB local/dev:

```bash
ENV_FILE=.env.local npm run db:migrate
```

Iniciar API local:

```bash
PORT=3010 ENV_FILE=.env.local npm start
```

Base URL usada nos exemplos:

```text
http://127.0.0.1:3010
```

## 4. Smoke sem autenticacao

Com `PLAYER_STEAM_AUTH_ENABLED` ausente ou diferente de `true`, o default e o
Steam Auth skeleton permanecer indisponivel.

### Steam start desabilitado

```bash
curl -i "http://127.0.0.1:3010/player/auth/steam/start"
```

Esperado:

- HTTP `501`.
- JSON com `ok: false`.
- `error: "steam_auth_not_implemented"`.

### Steam callback desabilitado

```bash
curl -i "http://127.0.0.1:3010/player/auth/steam/callback"
```

Esperado:

- HTTP `501`.
- JSON com `ok: false`.
- `error: "steam_auth_not_implemented"`.

### Player me sem cookie

```bash
curl -i "http://127.0.0.1:3010/player/me"
```

Esperado:

- HTTP `401`.
- JSON com `ok: false`.
- `error: "Unauthorized"`.

### Bunker summary sem cookie

```bash
curl -i "http://127.0.0.1:3010/player/bunker/summary"
```

Esperado:

- HTTP `401`.
- JSON com `ok: false`.
- `error: "Unauthorized"`.

## 5. Smoke com PLAYER_STEAM_AUTH_ENABLED=true

Iniciar API local com o skeleton Steam Auth habilitado:

```bash
PORT=3010 ENV_FILE=.env.local PLAYER_STEAM_AUTH_ENABLED=true npm start
```

### Steam start habilitado

```bash
curl -i "http://127.0.0.1:3010/player/auth/steam/start"
```

Esperado:

- HTTP redirect.
- Header `Location` apontando para
  `https://steamcommunity.com/openid/login`.
- Query OpenID conceitual com `openid.mode=checkid_setup`.

### Steam callback habilitado

```bash
curl -i "http://127.0.0.1:3010/player/auth/steam/callback"
```

Esperado:

- HTTP `400`.
- JSON com `ok: false`.
- `error` iniciando com `steam_openid_`.

Exemplo seguro de callback invalido:

```bash
curl -i "http://127.0.0.1:3010/player/auth/steam/callback?openid.mode=id_res"
```

Esperado:

- HTTP `400`.
- JSON com `ok: false`.
- `error` iniciando com `steam_openid_`.

Um callback Steam real verificado deve retornar:

- HTTP `200`.
- JSON com `ok: true`.
- `authenticated: true`.
- `verified: true`.
- `steamid64` preenchido.
- `player.playerAccountId` preenchido.
- `session.issued: true`.
- Header `Set-Cookie` com `hsc_player_session=...`.

O JSON nao deve expor token bruto, cookie, `Set-Cookie` ou `token_hash`.
Nao adicione exemplos completos de callback real com assinatura Steam neste
documento; a query e longa e deve ser tratada como material sensivel de fluxo.
O callback real deve ser testado via navegador/Steam em uma etapa futura
controlada.

Com um cookie player valido obtido no callback:

- `GET /player/me` deve retornar HTTP `200` com `authenticated: true`.
- `GET /player/bunker/summary` deve retornar HTTP `200` com o skeleton
  autenticado do Bunker.

Sem cookie, `GET /player/me` e `GET /player/bunker/summary` continuam
retornando HTTP `401`.

## 6. Smoke autenticado local

O smoke autenticado local fica em:

```bash
ops/player-auth-authenticated-local-smoke.sh
```

Ele nao usa Steam OpenID real. O script cria uma sessao player diretamente no
DB local/dev e usa o cookie player apenas durante a execucao, sem imprimir token
bruto, cookie ou header `Cookie`.

O fluxo validado cobre:

- `GET /health` com HTTP `200`.
- Criacao de sessao local para `TEST_STEAMID64`.
- `GET /player/me` autenticado com HTTP `200`.
- `GET /player/bunker/summary` autenticado com HTTP `200`.
- `POST /player/auth/logout` autenticado com HTTP `200`.
- `GET /player/me` com o cookie anterior retornando HTTP `401`.
- `GET /player/bunker/summary` com o cookie anterior retornando HTTP `401`.
- `GET /player/me` sem cookie retornando HTTP `401`.
- `GET /player/bunker/summary` sem cookie retornando HTTP `401`.

Guardrails do proprio script:

- `BASE_URL` deve ser `localhost` ou `127.0.0.1`.
- O DB carregado por `ENV_FILE` deve ser `127.0.0.1:3307` ou
  `localhost:3307`.
- O script imprime apenas `BASE_URL`, `ENV_FILE` e `TEST_STEAMID64` como
  contexto operacional.

## 7. Logout player-facing

Rota:

```text
POST /player/auth/logout
```

Comportamento:

- Le o cookie `hsc_player_session`.
- Revoga a sessao player se o cookie existir e corresponder a uma sessao.
- Limpa sempre o cookie `hsc_player_session`.
- Retorna HTTP `200` de forma idempotente:

```json
{ "ok": true, "loggedOut": true }
```

Sem cookie, a rota tambem retorna HTTP `200`, limpa o cookie e nao trata a
ausencia de sessao como erro.

O JSON de logout nao deve expor token bruto, cookie, `Set-Cookie` ou
`token_hash`.

## 8. Guardrails

- Nao rodar este smoke contra producao.
- Nao expor cookies reais em terminal compartilhado, docs, PRs ou logs.
- Nao colar token bruto em terminal compartilhado, docs, PRs ou logs.
- Nao documentar secrets nem valores reais de `.env`.
- Nao assumir login Steam real neste skeleton.
- Nao colar `Set-Cookie` real em PRs, docs ou logs.
- Nao colar callback query real completa em PRs, docs ou logs.
- Nao criar usuario, identidade ou sessao manualmente em DB de producao.
- Nao alterar Admin Auth como parte deste smoke.
- Nao usar `hsc_admin_session` para validar Player Auth.
- Nao rodar o smoke autenticado contra producao.
- Garantir que `BASE_URL` e DB sejam locais antes de rodar smoke autenticado.
- Nao assumir Portal UI pronta.
- Nao assumir redirect final para o Portal enquanto esse contrato nao existir.
- Nao rodar deploy, release, rollback ou smoke de producao.

## 9. Proxima PR possivel

Proximas fatias possiveis:

- `feat(player-auth): add Portal callback redirect contract`
- `feat(player-bunker): connect authenticated summary to real player stats contract`
- `docs(player-auth): record Player Auth MVP backend checkpoint`
- `test(player-auth): add CI-safe unit tests for Player Auth helpers`
