# Steam Profiles

O `hsc-auth-api` e o dono canonico do cache de Steam Profiles para o produto HSC.
Esse dominio centraliza os dados de avatar usados por Season Ranking, podio, tabelas,
futura area logada e futuras superficies do portal.

## Responsabilidades

- `hsc-auth-api`: chama a Steam Web API, normaliza e persiste o cache em `steam_profiles`.
- `hsc-cs2-etl`: consome o endpoint interno do Auth API para resolver perfis e publicar `steam_avatar_url` nos JSONs estaticos.
- `hsc-cs2-portal`: apenas exibe `steam_avatar_url`; nao chama Steam nem o Auth API para essa finalidade.
- `hsc-backoffice-admin`: fora desta fatia.

## Ambiente

Variaveis usadas pelo cache:

```text
STEAM_API_KEY=
INTERNAL_API_KEY=
STEAM_PROFILE_CACHE_TTL_SECONDS=86400
STEAM_API_TIMEOUT_SECONDS=8
```

`STEAM_API_KEY` e segredo e nunca deve ser logada, exposta em respostas HTTP ou copiada para documentacao. `INTERNAL_API_KEY` protege os endpoints internos; se ela nao estiver configurada, a rota interna retorna `503` de forma segura.

## Endpoint Interno

```http
POST /internal/steam/profiles/resolve
X-Internal-Key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Body:

```json
{
  "steamids": ["76561190000000000"]
}
```

Resposta:

```json
{
  "ok": true,
  "profiles": {
    "76561190000000000": {
      "steamid64": "76561190000000000",
      "personaname": "player",
      "profile_url": "https://steamcommunity.com/...",
      "avatar_url": "https://avatars.cloudflare.steamstatic.com/...",
      "avatar_medium_url": "https://avatars.cloudflare.steamstatic.com/...",
      "avatar_full_url": "https://avatars.cloudflare.steamstatic.com/...",
      "fetched_at": "2026-05-07T20:00:00.000Z"
    }
  },
  "missing": []
}
```

## Cache e Fallback

SteamIDs validos devem ter 17 digitos. IDs invalidos entram em `missing` e nao quebram a chamada.

O cache usa `STEAM_PROFILE_CACHE_TTL_SECONDS`, com default de 86400 segundos. Perfis frescos sao respondidos diretamente do banco. Perfis ausentes ou vencidos sao buscados na Steam Web API em lotes de ate 100 IDs usando `ISteamUser/GetPlayerSummaries/v2`.

Se a Steam falhar, o Auth API retorna o cache existente quando houver. IDs sem cache permanecem em `missing`.

Status esperados:

- `200`: resposta resolvida via cache e/ou Steam API.
- `400`: body invalido.
- `401`: `X-Internal-Key` ausente ou invalido.
- `503`: `INTERNAL_API_KEY` ausente ou banco indisponivel.

## Smoke manual local

Pre-condicoes:

```bash
ENV_FILE=.env.local.example npm run db:migrate
PORT=3010 ENV_FILE=.env.local.example npm start
```

Para testar resposta `200` com autenticacao interna, configure `INTERNAL_API_KEY`
em um ambiente local seguro. Para buscar dados externos da Steam, configure tambem
`STEAM_API_KEY` nesse ambiente local seguro. Nunca coloque segredos reais no Git,
em exemplos de documentacao ou em comandos compartilhados.

Smoke sem `INTERNAL_API_KEY` configurada:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -d '{"steamids":["<STEAMID64_VALIDO>"]}'
```

Resultado esperado: `503` com `internal_api_key_not_configured`.

Smoke com chave errada:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: wrong-key" \
  -d '{"steamids":["<STEAMID64_VALIDO>"]}'
```

Resultado esperado: `401` com `invalid_internal_key`.

Smoke com body invalido:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{"steamids":"<STEAMID64_VALIDO>"}'
```

Resultado esperado: `400` com `invalid_body`.

Smoke com `INTERNAL_API_KEY` valida e sem `STEAM_API_KEY`:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{"steamids":["<STEAMID64_VALIDO>"]}'
```

Resultado esperado: `200` com `profiles` e `missing`. Se nao houver cache para
`<STEAMID64_VALIDO>`, ele deve aparecer em `missing`. Isso prova que a ausencia
da `STEAM_API_KEY` nao quebra a rota.

Smoke com `INTERNAL_API_KEY` valida e `STEAM_API_KEY` valida:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{"steamids":["<STEAMID64_VALIDO>"]}'
```

Resultado esperado: `200`, com `profiles` preenchido para SteamIDs resolvidos.
A chamada deve persistir ou atualizar `steam_profiles`. A key nunca deve aparecer
na resposta HTTP ou nos logs.

Smoke de rerun/cache:

```bash
curl -i -X POST "http://127.0.0.1:3010/internal/steam/profiles/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: <INTERNAL_API_KEY>" \
  -d '{"steamids":["<STEAMID64_VALIDO>"]}'
```

Repita a chamada enquanto o TTL estiver valido. Resultado esperado: resposta
estavel via cache, sem depender de nova resolucao externa.
