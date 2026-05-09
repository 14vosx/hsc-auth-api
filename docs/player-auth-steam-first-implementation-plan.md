# Player Auth Steam-first implementation plan

## 1. Objetivo

Este documento planeja a implementacao local da Player Auth Steam-first do Bunker
no `hsc-auth-api`, traduzindo o contexto canonico do `hsc-docs` para passos
tecnicos revisaveis neste repositorio.

Esta PR nao implementa Player Auth. Ela nao altera codigo, migrations,
endpoints, Admin Auth, cookies ou sessoes existentes.

## 2. Estado atual do hsc-auth-api

O `hsc-auth-api` hoje e responsavel por autenticacao administrativa,
sessoes administrativas via cookie, RBAC/admin access, APIs administrativas,
conteudo publico, News, Seasons, uploads e cache de Steam Profiles.

O Admin Auth existente usa sessao administrativa baseada em cookie. O cookie
padrao atual e `hsc_admin_session`, definido por `ADMIN_SESSION_COOKIE`, e a
resolucao passa por `resolveSessionAdmin`/`requireAdmin`.

O magic link atual pertence ao fluxo administrativo/backoffice. Ele nao deve
virar a fundacao player-facing do Bunker. O MVP do Bunker e Steam-first, sem
senha propria e sem magic link player-facing como base de autenticacao.

Ja existe cache canonico de Steam Profiles em `steam_profiles`, criado pela
migration `0006_steam_profiles.sql`. Esse cache persiste dados publicos de
perfil Steam, como `steamid64`, persona, profile URL, avatars e timestamps de
fetch.

O registro central de rotas fica em `registerAllRoutes`, em
`src/routes/register.js`. Novas rotas futuras de Player Auth devem ser
registradas por esse ponto de composicao, sem misturar dependencias de Admin
Auth.

As migrations SQL atuais vao ate `db/migrations/0006_steam_profiles.sql`.
Qualquer evolucao futura de schema deve usar nova migration numerada, conforme
`docs/db-migrations-policy.md`.

## 3. Fronteira Admin Auth vs Player Auth

Admin Auth deve permanecer legado funcional e sem mudanca de contrato neste
plano. Player Auth deve nascer como dominio separado.

Regras de fronteira para PRs futuras:

- Nao reutilizar o cookie `hsc_admin_session` para player-facing.
- Nao reutilizar o middleware `requireAdmin` para autorizar Player Auth.
- Nao acoplar roles administrativas como `admin`, `viewer` ou `editor` ao
  usuario player-facing sem decisao explicita.
- Nao alterar comportamento de magic link, sessao administrativa, admin key ou
  autorizacao administrativa como efeito colateral.
- Modelar Player Auth com middleware, repositorios, tabelas e configuracao
  proprios.

## 4. Dominio proposto para Player Auth MVP

Proposta conceitual para discussao e futuras migrations. Nenhuma migration e
criada nesta PR.

### `player_accounts`

Representa a conta HSC player-facing. No MVP, a conta nasce a partir de um login
Steam validado.

Campos candidatos:

- `id`: identificador interno da conta player.
- `created_at`, `updated_at`: auditoria basica.
- `disabled_at` ou status equivalente: bloqueio operacional futuro, se
  aprovado.
- campos minimos de consentimento, caso a politica do produto exija no MVP.

### `player_steam_identities` ou `player_identities`

Representa a identidade externa vinculada a uma conta player. Para o MVP
Steam-first, pode ser uma tabela especifica de Steam ou uma tabela generica de
providers com provider inicial `steam`.

Campos candidatos:

- `player_account_id`: FK para `player_accounts`.
- `steamid64`: SteamID provado pelo login Steam.
- `created_at`, `updated_at`: auditoria basica.
- `last_login_at`: ultimo login Steam bem-sucedido.
- constraint unica para `steamid64`.

Decisao a registrar antes da migration: tabela especifica
`player_steam_identities` favorece simplicidade do MVP; tabela generica
`player_identities` favorece extensibilidade futura. Como nao ha outro provider
no MVP, a escolha deve ser explicita em PR de schema.

### `player_sessions`

Representa sessoes player-facing separadas das sessoes administrativas.

Campos candidatos:

- `id`: identificador da sessao.
- `player_account_id`: FK para `player_accounts`.
- `token_hash`: hash SHA-256 ou equivalente do token de sessao.
- `created_at`, `expires_at`, `revoked_at`: ciclo de vida da sessao.
- metadados minimos opcionais de seguranca, se aprovados.

O token bruto nunca deve ser persistido. Somente o hash deve ir ao banco.

### `player_consents` ou campos minimos de consentimento

Se houver consentimento necessario para o Bunker no MVP, documentar antes a
base legal, finalidade e dado armazenado. A opcao mais simples e manter campos
minimos em `player_accounts`; uma tabela `player_consents` so deve ser criada
se houver historico, multiplos tipos de aceite ou necessidade de auditoria mais
detalhada.

### Relacao com `steam_profiles`

`steam_profiles` deve continuar sendo cache de dados publicos do perfil Steam,
relacionado por `steamid64`. Player Auth nao deve duplicar avatar/persona quando
puder compor dados a partir desse cache.

## 5. Rotas candidatas MVP

Rotas candidatas para PRs futuras. Nao implementar nesta PR.

- `GET /player/auth/steam/start`: inicia o fluxo de login Steam.
- `GET /player/auth/steam/callback`: recebe o retorno Steam, prova posse do
  SteamID, cria ou resolve a conta HSC e emite sessao player.
- `POST /player/auth/logout`: revoga sessao player atual e remove cookie
  player-facing.
- `GET /player/me`: retorna a conta player autenticada e dados publicos
  compostos, quando aplicavel.
- `GET /player/bunker/summary`: retorna um resumo autenticado do Bunker para o
  proprio usuario.

Qualquer resposta, status code, validacao, payload ou erro dessas rotas e uma
decisao de contrato e deve ser revisado na PR que implementar o endpoint.

## 6. Cookie/session player-facing

Cookie proposto para Player Auth:

```text
hsc_player_session
```

Diretrizes:

- Deve ser separado de `hsc_admin_session`.
- Deve ser `HttpOnly`.
- Deve usar `Secure` em producao.
- Deve usar `SameSite` adequado ao Portal em `/bunker`, considerando dominio,
  subdominio e fluxo de callback Steam.
- Deve ter TTL definido explicitamente antes da implementacao.
- Deve suportar logout/revogacao via `revoked_at` ou mecanismo equivalente.
- Deve persistir somente hash do token no banco, nunca o token bruto.
- Logs e erros nao devem imprimir cookie, token bruto ou hash completo.

## 7. Steam-first / claim Steam

Steam e o provider inicial do MVP. O login Steam prova a posse de um SteamID.
A conta HSC nasce ou e resolvida a partir desse SteamID.

Regras do MVP:

- Sem senha propria.
- Sem magic link player-facing como fundacao.
- Sem troca ou desvinculacao self-service de Steam.
- Sem multiplos providers.
- Reutilizar `steam_profiles` para dados publicos de perfil.
- Nao armazenar inventario Steam, trade data, wallet, CPF, telefone, endereco
  ou dados financeiros.

O Auth API pode atualizar ou consultar o cache de Steam Profiles para enriquecer
respostas player-facing, mas o vinculo de identidade deve se basear no SteamID
provado pelo fluxo de login.

## 8. Gateway autenticado para Bunker

O Bunker e a area logada player-facing privada do Portal em `/bunker`.

No MVP/primeira evolucao, o `hsc-auth-api` hospeda Player Auth e atua como dono
de identidade, sessao, autorizacao e gateway autenticado. Um servico separado
futuro so deve ser reavaliado se billing, escala ou complexidade justificarem.

Responsabilidades esperadas do Auth API:

- Autorizar acesso do usuario aos proprios dados.
- Resolver sessao player.
- Compor conta, sessao e Steam profile publico.
- Expor contratos autenticados para o Bunker.

Nao responsabilidades:

- Calcular estatisticas.
- Ser motor estatistico.
- Assumir ownership do ETL.
- Implementar billing ou entitlements pagos no MVP.

Stats de temporada, stats por player e lifetime stats devem vir de ETL, static
artifacts ou contratos futuros. O Auth API pode expor esses dados por camada
autenticada quando houver contrato definido, garantindo que o usuario acesse
apenas seus proprios dados.

## 9. Seguranca e LGPD

Diretrizes para PRs futuras:

- Coletar e persistir somente dados minimos para identidade, sessao e
  autorizacao.
- Registrar consentimento quando necessario e com finalidade clara.
- Nao logar tokens, cookies reais, Steam API key, internal API key ou dados
  sensiveis.
- Nao documentar secrets nem exemplos derivados de `.env` real.
- Evitar dados sensiveis e dados financeiros no MVP.
- Manter billing e entitlements fora do MVP.
- Separar claramente identidade player-facing de identidade administrativa.
- Garantir revogacao de sessao e expiracao previsivel.

## 10. Plano incremental de PRs

Sequencia sugerida:

1. `docs(player-auth): plan Steam-first player auth implementation`
2. `db(player-auth): add player accounts and sessions schema`
3. `feat(player-auth): add player session cookie config and middleware skeleton`
4. `feat(player-auth): add Steam auth start/callback skeleton`
5. `feat(player-auth): add /player/me`
6. `feat(player-bunker): add authenticated bunker summary contract skeleton`
7. `docs(player-auth): record local smoke/runbook`

Cada PR deve preservar contratos existentes e chamar explicitamente qualquer
novo contrato publico, campo de resposta, status code, regra de validacao ou
mudanca de comportamento.

## 11. Fora do escopo

Fora do escopo deste plano e da PR atual:

- Portal UI.
- Backoffice UI.
- Billing.
- Entitlements pagos.
- Servico separado `hsc-user-api`.
- Alteracao de Admin Auth.
- Alteracao de magic link administrativo.
- Alteracao de cookie/session existente.
- Deploy/producao.
- Migrations reais nesta PR.
- Endpoints reais nesta PR.
- Calculo ou materializacao de stats.

## 12. Validacao para PRs futuras

Validacao recomendada para PRs futuras, conforme o tipo de mudanca:

- `npm start`, quando a mudanca envolver runtime da API.
- Smoke local conforme o repo permitir.
- `npm run db:migrate` apenas contra DB local/dev, quando houver migration.
- `curl` local para endpoints futuros.
- `git diff --check`.
- `git diff --stat`.
- `git status --short`.

Nao rodar migrations, smokes, deploys ou comandos contra producao sem
autorizacao explicita.
