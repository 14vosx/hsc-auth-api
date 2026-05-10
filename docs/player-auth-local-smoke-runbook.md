# Player Auth/Bunker local smoke runbook

## 1. Objetivo

Este runbook registra um smoke local para o skeleton de Player Auth/Bunker no
`hsc-auth-api`.

O objetivo e validar o estado atual sem Steam OpenID real, sem login Steam
funcional e sem criacao de conta ou sessao player.

## 2. Estado atual integrado

Estado esperado apos as PRs #53 a #58:

- #53: plano local de Player Auth Steam-first.
- #54: schema de Player Auth com contas, identidades Steam e sessoes player.
- #55: skeleton de middleware, cookie e helpers de sessao player.
- #56: skeleton das rotas Steam Auth player-facing.
- #57: endpoint autenticado `GET /player/me`.
- #58: endpoint autenticado `GET /player/bunker/summary`.

O Steam Auth ainda nao valida OpenID, nao consulta Steam, nao cria conta, nao
cria sessao e nao emite `hsc_player_session`.

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

- HTTP `501`.
- JSON com `ok: false`.
- `error: "steam_callback_not_implemented"`.

Importante: este estado ainda nao autentica usuario. O callback nao valida
assinatura OpenID, nao extrai SteamID como identidade autenticada, nao cria
conta, nao cria sessao e nao seta cookie.

## 6. Guardrails

- Nao rodar este smoke contra producao.
- Nao expor cookies reais em terminal compartilhado, docs, PRs ou logs.
- Nao documentar secrets nem valores reais de `.env`.
- Nao assumir login Steam real neste skeleton.
- Nao criar usuario, identidade ou sessao manualmente em DB de producao.
- Nao alterar Admin Auth como parte deste smoke.
- Nao usar `hsc_admin_session` para validar Player Auth.
- Nao rodar deploy, release, rollback ou smoke de producao.

## 7. Proxima PR possivel

Proximas fatias possiveis:

- `feat(player-auth): add Steam OpenID callback verification`
- `test(player-auth): add local route smoke script`
