# hsc-auth-api

API de autenticacao e conteudo do HSC, responsavel por Auth, sessoes administrativas, RBAC/admin access, APIs administrativas, conteudo publico, News, Seasons, uploads e cache de perfis Steam.

## Papel no ecossistema HSC

Este repositorio fornece autenticacao e sessao administrativa para servicos do HSC. Ele expoe APIs administrativas usadas pelo `hsc-backoffice-admin` e, quando aplicavel, contratos publicos de conteudo consumidos pelo Portal/ETL.

O `hsc-auth-api` tambem e o dono canonico de alguns dados de conteudo, como News, Seasons e Steam Profiles.

Este repositorio nao e:

- o Portal Angular;
- o ETL da Static API;
- o Backoffice UI.

## Escopo

- Magic link authentication
- Cookie-based admin session
- Admin users
- Admin/content News APIs
- Seasons admin/public APIs
- Uploads protegidos
- Steam Profiles cache
- Health/readiness
- SQL migrations

## Fora de escopo

- UI administrativa
- Portal player-facing
- geracao da Static API v2
- deploy do portal estatico
- administracao de Nginx/systemd/DNS/TLS
- dados locais do jogo/MatchZy

## Estrutura principal

- `index.js`: ponto de entrada da API Express.
- `src/config`: configuracao da aplicacao e leitura segura de variaveis de ambiente.
- `src/db`: acesso ao banco MySQL/MariaDB via `mysql2`.
- `src/middlewares`: middlewares compartilhados, incluindo validacoes e autorizacao quando aplicavel.
- `src/routes`: definicao das rotas HTTP.
- `src/services`: regras de negocio e integracoes internas.
- `src/utils`: utilitarios compartilhados.
- `scripts/migrate.js`: executor local das migrations SQL.
- `docs/`: documentacao local do repositorio.
- `docker-compose.yml`: apoio opcional para ambiente local; inspecione antes de usar.
- `.env.local.example`: referencia segura de nomes de variaveis de ambiente.
- `AGENTS.md`: regras operacionais, de seguranca e de validacao para trabalho neste repositorio.

## Desenvolvimento local

Instale dependencias, prepare variaveis locais, rode migrations em ambiente local/dev e inicie a API:

```bash
npm ci
cp .env.local.example .env.local
npm run db:migrate
npm start
```

Copiar `.env.local.example` e apenas um ponto de partida local. Os valores de `.env.local` devem ser revisados pelo desenvolvedor antes de executar a aplicacao.

`.env.local` e secreto/local e nao deve ser commitado, impresso, copiado para documentacao ou usado como fonte para exemplos. Use `.env.local.example` como referencia segura de nomes.

Pode existir apoio a Docker/MariaDB local via `docker-compose.yml`. Antes de usar Docker, inspecione o compose e confirme que os comandos apontam para ambiente local/dev. Nao execute comandos contra producao sem autorizacao explicita.

## Variaveis de ambiente

Nao documente valores reais de variaveis neste README. Consulte `.env.local.example` para os nomes seguros.

Categorias esperadas:

- runtime/server
- database
- allowed origin / CORS
- admin/internal API keys
- Steam API
- uploads

## Migrations

As migrations sao executadas por `scripts/migrate.js` via:

```bash
npm run db:migrate
```

Mudancas de banco devem ser feitas por novas migrations numeradas e revisaveis. Nao edite migrations ja aplicadas sem decisao explicita.

Rode migrations somente em ambiente local/dev, salvo autorizacao explicita para outro ambiente. A politica local esta em `docs/db-migrations-policy.md`.

## Rotas e capacidades principais

Este README lista apenas categorias de rotas e capacidades, sem prometer contrato detalhado:

- `/health`
- `/auth/*`
- `/admin/*`
- `/content/news/*`
- `/content/seasons/*`
- uploads admin
- Steam profiles/cache interno, quando aplicavel

Nao coloque tokens, headers secretos, cookies reais ou exemplos de admin key na documentacao.

## Integracao com outros repos

- `hsc-backoffice-admin` consome Admin APIs.
- `hsc-cs2-portal` consome conteudo publico quando aplicavel.
- `hsc-cs2-etl` pode consumir contratos publicos/internos para materializacao da Static API v2, como Seasons/Steam Profiles.
- `hsc-docs` guarda a documentacao canonica.
- `hsc-brand-hub` e separado e nao depende diretamente desta API.

## Validacao local

Com ambiente local/dev configurado, os comandos basicos de validacao sao:

```bash
npm run db:migrate
npm start
```

Smoke scripts locais podem existir em `ops/`, como apoio a validacao local. Nao rode scripts de deploy/release como validacao. Nao rode smokes ou migrations contra producao sem autorizacao explicita. Siga sempre `AGENTS.md`.

## Seguranca

- Nunca commite `.env`, `.env.local` ou segredos.
- Nunca imprima valores sensiveis em logs, PRs ou README.
- Nao publique uploads fora da politica do projeto.
- Nao exponha Admin APIs sem autenticacao/autorizacao.
- Nao mude contratos publicos sem decisao explicita.
- Nao adicione dependencias sem aprovacao.
- Respeite `AGENTS.md`.

## Documentacao relacionada

Documentacao local neste repositorio:

- `docs/baseline-smoke.md`
- `docs/db-migrations-policy.md`
- `docs/admin/uploads.md`
- `docs/steam-profiles.md`

Documentacao canonica no repositorio `hsc-docs`:

- `docs/00-governance/hsc-repositories-map.md`
- `docs/04-infra-aws-lightsail/auth-api-operations.md`
- `docs/04-infra-aws-lightsail/deploy-release-rollback.md`
- `docs/05-backoffice-admin/admin-api-contracts.md`
- `docs/05-backoffice-admin/news-admin-api-contracts.md`
- `docs/05-backoffice-admin/news-admin-feature-implementation-spec.md`

## Workflow

- Trabalhe em branch.
- Prefira PRs pequenos e focados.
- Antes de finalizar, rode:

```bash
git diff --check
git diff --stat
git status --short
```

Para mudancas de codigo, rode as validacoes relevantes. Para mudancas de README, valide whitespace e ausencia de segredo.
