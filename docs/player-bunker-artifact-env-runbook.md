# Player Bunker Artifact Env Runbook

## Contexto

O ETL é dono das stats e dos artifacts do Bunker.

A Auth API é o gateway autenticado read-only para esses artifacts. Ela valida a
sessão player, resolve o artifact local esperado e retorna uma resposta segura
para o Portal.

O Portal consome a Auth API. Ele não deve ler diretamente o artifact gerado pelo
ETL.

## Configurações

A leitura do artifact depende destas envs na Auth API:

```text
PLAYER_BUNKER_ARTIFACT_ROOT
PLAYER_BUNKER_ACTIVE_SEASON_SLUG
PLAYER_BUNKER_STATIC_API_BASE_URL
PLAYER_BUNKER_STATIC_API_TIMEOUT_MS
```

`PLAYER_BUNKER_ARTIFACT_ROOT` aponta para o diretório raiz controlado onde o ETL
publica os artifacts para leitura local pela Auth API.

`PLAYER_BUNKER_ACTIVE_SEASON_SLUG` seleciona a season ativa dentro desse root.

`PLAYER_BUNKER_STATIC_API_BASE_URL` é opcional e aponta para a Static API v2
quando a Auth API deve enriquecer `/player/bunker/summary` com
`data.competitiveProfile`. O source esperado é o JSON público:

```text
<PLAYER_BUNKER_STATIC_API_BASE_URL>/player/<steamid64>.json
```

`PLAYER_BUNKER_STATIC_API_TIMEOUT_MS` controla o timeout curto dessa leitura
opcional. Se a Static API v2 não estiver configurada, retornar 404, falhar,
expirar ou enviar JSON inválido, a Auth API mantém HTTP 200 e continua
retornando `seasonPlayer` ou o fallback atual. Nenhum cookie, secret ou token é
necessário para esse enriquecimento, e essa configuração não implica deploy.

Root recomendado para staging/local nesta etapa:

```text
/var/tmp/hsc-cs2-etl-build/season-player
```

Com as envs configuradas, o path esperado para cada player é:

```text
<root>/season/<seasonSlug>/player/<steamid64>.json
```

Exemplo com placeholders seguros:

```bash
export PLAYER_BUNKER_ARTIFACT_ROOT="/var/tmp/hsc-cs2-etl-build/season-player"
export PLAYER_BUNKER_ACTIVE_SEASON_SLUG="cs2-YYYY-season-name"

test -f "$PLAYER_BUNKER_ARTIFACT_ROOT/season/$PLAYER_BUNKER_ACTIVE_SEASON_SLUG/player/7656119XXXXXXXXXX.json"
```

Não cole valores reais de `.env`, cookies, tokens ou callback Steam em docs,
comandos compartilhados ou logs.

## Responsabilidades

A Auth API não escreve artifact e não calcula stats. A leitura de
`competitiveProfile` é apenas um enriquecimento opcional por HTTP contra a
Static API v2; o artifact Season-scoped continua vindo do filesystem local
read-only.

O fluxo esperado é:

```text
ETL gera artifact local -> Auth API lê artifact read-only -> Portal consome Auth API
```

Qualquer mudança no formato do artifact deve ser tratada primeiro como contrato
do ETL e revisada antes de depender dela no Portal.

## Comportamento Esperado

Quando as envs de artifact estão ausentes ou incompletas:

```text
data.bunker.statsAvailable = false
not_configured
```

Quando o arquivo do player não existe no layout esperado:

```text
data.bunker.statsAvailable = false
not_found
```

Quando o JSON existe, mas é inválido, a Auth API deve retornar fallback seguro:

```text
data.bunker.statsAvailable = false
season_player_artifact_unavailable
```

Quando o artifact é válido:

```text
data.bunker.statsAvailable = true
data.seasonPlayer = <artifact sanitizado>
```

Quando a Static API v2 retorna um profile válido para o SteamID autenticado:

```text
data.competitiveProfile = <profile sanitizado>
data.player.avatarMedium = <avatar da Static API v2, se existir>
data.player.steamProfileUrl = <profile URL da Static API v2, se existir>
competitive_profile_connected
```

Quando a Static API v2 está configurada, mas o profile opcional não pode ser
lido:

```text
data.competitiveProfile = null
competitive_profile_unavailable
```

O payload exposto em `data.seasonPlayer` deve ser sanitizado antes de sair da
Auth API.

## Segurança

Não colocar tokens, cookies, secrets, callbacks Steam reais ou hashes sensíveis
no artifact.

O sanitizer da Auth API remove chaves contendo:

```text
token
cookie
hash
```

O root deve ser um diretório controlado, legível pela Auth API e fora de
webroots públicos. Não usar `/var/www` como artifact root nesta etapa.

Não colar valores reais de `.env`, cookies, headers `Cookie`, `Set-Cookie`,
tokens, hashes ou callback Steam em docs, tickets, comandos compartilhados ou
logs.

## Checklist de Staging

1. ETL gera artifact em root controlado.
2. Confirmar arquivo player JSON no layout esperado.
3. Configurar envs na Auth API.
4. Reiniciar a Auth API de forma controlada.
5. Validar `/health`.
6. Validar `GET /player/bunker/summary` com sessão player.
7. Validar Portal `/bunker`.

Exemplo seguro para conferir o layout:

```bash
ARTIFACT_ROOT="/var/tmp/hsc-cs2-etl-build/season-player"
SEASON_SLUG="cs2-YYYY-season-name"
STEAMID64="7656119XXXXXXXXXX"

test -f "$ARTIFACT_ROOT/season/$SEASON_SLUG/player/$STEAMID64.json"
```

Exemplo seguro de envs para a Auth API:

```bash
PLAYER_BUNKER_ARTIFACT_ROOT="/var/tmp/hsc-cs2-etl-build/season-player"
PLAYER_BUNKER_ACTIVE_SEASON_SLUG="cs2-YYYY-season-name"
PLAYER_BUNKER_STATIC_API_BASE_URL="http://127.0.0.1:8080/api/cs2/v2"
PLAYER_BUNKER_STATIC_API_TIMEOUT_MS="1500"
```

Exemplo seguro de validação local da API:

```bash
curl -i "http://127.0.0.1:3010/health"
curl -i "http://127.0.0.1:3010/player/bunker/summary" \
  -H "Cookie: hsc_player_session=<player-session-cookie-placeholder>"
```

Não registrar o cookie real usado na validação.

## Smoke Local

Smoke local relacionado:

```text
ops/player-bunker-artifact-summary-smoke.sh
```

Esse smoke deve ser usado apenas contra ambiente local/dev. Ele valida o caminho
artifact-backed de `GET /player/bunker/summary` usando fixtures locais e
placeholders seguros.

## Limitações

- Artifact prod ainda não está publicado.
- Cron/timer ETL ainda não integrado neste runbook.
- Portal staging/deploy é outro runbook.
- `competitiveProfile` é opcional e não substitui `seasonPlayer`.

## Próximas Frentes

- ETL staging job/runbook.
- Produção controlada depois.
- Validação Steam real end-to-end.
