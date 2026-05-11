# Player Auth/Bunker MVP backend checkpoint

## Objetivo

Registrar o estado backend consolidado do Player Auth/Bunker antes de avancar
para Portal UI, redirect contract ou stats reais.

Este checkpoint descreve o que esta implementado no `hsc-auth-api` apos as PRs
#53 a #69, quais contratos backend existem, quais smokes locais cobrem o fluxo
atual e quais limites ainda devem permanecer explicitos.

## Historico das PRs

- #53: plano Steam-first para Player Auth/Bunker.
- #54: schema de Player Auth com contas, identidades Steam e sessoes player.
- #55: skeleton de middleware/session player-facing.
- #56: skeleton das rotas Steam Auth player-facing.
- #57: endpoint autenticado `GET /player/me`.
- #58: endpoint autenticado `GET /player/bunker/summary`.
- #59: runbook inicial de smoke local Player Auth/Bunker.
- #60: smoke local default para rotas Player Auth/Bunker skeleton.
- #61: verificacao de callback Steam OpenID via Direct Verification.
- #62: docs do fluxo OpenID.
- #63: resolve/cria player account a partir de SteamID.
- #64: emissao de sessao player apos callback Steam verificado.
- #65: docs de emissao de sessao player.
- #66: smoke autenticado com criacao local de sessao.
- #67: rota de logout player-facing.
- #68: smoke autenticado cobrindo logout e revogacao de sessao.
- #69: docs com notas do smoke de logout.

## Contrato Backend Atual

### `GET /player/auth/steam/start`

Inicia o fluxo Steam OpenID quando `PLAYER_STEAM_AUTH_ENABLED=true`.

Comportamento atual:

- Retorna HTTP `503` com `{ "ok": false, "error": "db_not_ready" }` se o DB
  nao estiver pronto.
- Retorna HTTP `501` com payload de Steam Auth indisponivel quando Steam Auth
  estiver desabilitado.
- Redireciona para `https://steamcommunity.com/openid/login` quando habilitado.

### `GET /player/auth/steam/callback`

Recebe o callback Steam OpenID e valida a assinatura via Direct Verification.

Comportamento atual:

- Retorna HTTP `503` se o DB nao estiver pronto.
- Retorna HTTP `501` quando Steam Auth estiver desabilitado.
- Retorna HTTP `400` com erro `steam_openid_*` quando a verificacao falha.
- Quando a verificacao passa, resolve ou cria a conta player, emite sessao
  player, seta `hsc_player_session` e retorna HTTP `200` com:
  - `ok: true`;
  - `authenticated: true`;
  - `verified: true`;
  - `steamid64`;
  - `player.playerAccountId`;
  - `player.steamid64`;
  - `player.displayName`;
  - `session.issued: true`;
  - flags `accountCreated` e `identityCreated`.
- Retorna HTTP `403` quando a conta player resolvida estiver `disabled`.
- Retorna HTTP `500` se a conta ou sessao nao puder ser criada/resolvida.

O payload nao expoe token bruto, cookie, `Set-Cookie` ou `token_hash`.

### `GET /player/me`

Endpoint autenticado por sessao player.

Comportamento atual:

- Sem sessao player valida, retorna HTTP `401` com erro `Unauthorized`.
- Com sessao player valida, retorna HTTP `200` com `ok: true`,
  `authenticated: true` e dados da conta/sessao atual:
  - `playerAccountId`;
  - `steamid64`;
  - `displayName`;
  - `sessionId`;
  - `expiresAt`.

### `GET /player/bunker/summary`

Endpoint autenticado para o Bunker.

Comportamento atual:

- Sem sessao player valida, retorna HTTP `401` com erro `Unauthorized`.
- Com sessao player valida, retorna HTTP `200` com `ok: true`,
  `generatedAt`, dados do player autenticado e um resumo skeleton:
  - `bunker.status: "skeleton"`;
  - `seasonFirst: true`;
  - `statsAvailable: false`;
  - `currentSeason: null`;
  - `lifetime: null`;
  - notas `bunker_summary_skeleton` e `stats_contract_not_connected`.

### `POST /player/auth/logout`

Revoga a sessao player atual, se houver, e limpa o cookie player-facing.

Comportamento atual:

- Le o cookie `hsc_player_session`.
- Se o cookie existir, tenta revogar a sessao correspondente.
- Sempre limpa `hsc_player_session`.
- Retorna HTTP `200` de forma idempotente:

```json
{ "ok": true, "loggedOut": true }
```

Sem cookie, sessao inexistente ou sessao ja revogada, o logout continua
respondendo HTTP `200` e limpando o cookie.

## Fluxo Atual

Fluxo autenticado consolidado:

1. Steam OpenID callback e verificado via Direct Verification.
2. A API extrai o `steamid64` verificado.
3. `resolveOrCreatePlayerAccountFromSteamId` garante um placeholder em
   `steam_profiles`.
4. A API resolve ou cria a conta em `player_accounts`.
5. A API resolve ou cria o vinculo em `player_steam_identities`.
6. `createPlayerSessionForAccount` cria uma sessao em `player_sessions`.
7. A API emite o cookie `hsc_player_session`.
8. `GET /player/me` passa a resolver a sessao player autenticada.
9. `GET /player/bunker/summary` retorna o skeleton autenticado do Bunker.
10. `POST /player/auth/logout` revoga a sessao e limpa o cookie.
11. O mesmo cookie deixa de autenticar `/player/me` e
    `/player/bunker/summary`.

## Persistencia

Tabelas e responsabilidades atuais:

- `steam_profiles`: cache canonico publico de Steam Profiles. O fluxo de conta
  garante ao menos o placeholder por `steamid64`.
- `player_accounts`: conta HSC player-facing, criada/resolvida a partir do
  SteamID verificado.
- `player_steam_identities`: identidade Steam vinculada a uma conta player,
  com `steamid64` e `last_login_at`.
- `player_sessions`: sessoes player-facing com `token_hash`, `expires_at` e
  `revoked_at`.

Regras de persistencia:

- Nunca persistir token bruto.
- Persistir somente `token_hash` para sessoes.
- Considerar sessao ativa apenas quando `revoked_at IS NULL`,
  `expires_at > UTC_TIMESTAMP()` e a conta estiver `active`.
- Logout revoga a sessao preenchendo `revoked_at`.

## Smokes Locais

### `ops/player-auth-local-smoke.sh`

Smoke local default, sem autenticacao player.

Cobre:

- `GET /health` com HTTP `200`.
- `GET /player/auth/steam/start` retornando HTTP `501` quando Steam Auth esta
  desabilitado.
- `GET /player/auth/steam/callback` retornando HTTP `501` quando Steam Auth
  esta desabilitado.
- `GET /player/me` sem cookie retornando HTTP `401`.
- `GET /player/bunker/summary` sem cookie retornando HTTP `401`.

### `ops/player-auth-authenticated-local-smoke.sh`

Smoke local autenticado, sem Steam OpenID real.

Cobre:

- Guardrail de `BASE_URL` local: `localhost` ou `127.0.0.1`.
- Guardrail de DB local/dev: `127.0.0.1:3307` ou `localhost:3307`.
- Criacao local de sessao player para `TEST_STEAMID64`.
- `GET /player/me` autenticado com HTTP `200`.
- `GET /player/bunker/summary` autenticado com HTTP `200`.
- `POST /player/auth/logout` com HTTP `200`.
- `GET /player/me` com o cookie anterior retornando HTTP `401`.
- `GET /player/bunker/summary` com o cookie anterior retornando HTTP `401`.
- Checks sem cookie continuando HTTP `401`.

Guardrails dos smokes:

- Nao rodar contra producao.
- Nao imprimir token bruto.
- Nao imprimir cookie.
- Nao imprimir header `Cookie`.
- Nao imprimir env inteiro.
- Nao imprimir secrets ou `DB_PASS`.

## Seguranca e Guardrails

- Nao colar callback query real completa em docs, PRs ou logs.
- Nao colar `Set-Cookie` real em docs, PRs ou logs.
- Nao expor token bruto, cookie ou `token_hash`.
- Nao usar `hsc_admin_session` para Player Auth.
- Nao rodar smoke autenticado contra producao.
- Manter `BASE_URL` e DB locais para smokes autenticados.
- Manter Player Auth separado de Admin Auth.
- Nao alterar magic link administrativo como parte de Player Auth.
- Nao usar `requireAdmin` para endpoints player-facing.

## Limitacoes Atuais

- Sem redirect final para o Portal.
- Sem UI Portal/Bunker ainda.
- `/player/bunker/summary` ainda e skeleton.
- Sem stats reais.
- Sem entitlements/billing.
- Sem refresh obrigatorio de Steam profile no login.
- Sem logout no Portal UI.
- Sem testes CI-safe automatizados para helpers.

## Proximas Frentes Recomendadas

1. `feat(player-auth): add Portal callback redirect contract`
2. `feat(player-bunker): connect authenticated summary to real player stats contract`
3. `test(player-auth): add CI-safe unit tests for Player Auth helpers`
4. `docs(auth-api): plan internal architecture hardening`
5. `feat(player-auth): add player logout use in Portal UI`, quando Portal
   estiver pronto.

## Fora de Escopo

- Deploy/prod.
- Alteracoes em Admin Auth.
- Alteracao de schema.
- Portal UI.
- Backoffice.
- Billing/monetizacao.
