# HSC Auth API

API de autenticação, identidade, conteúdo e acesso autenticado do ecossistema HSC.

A aplicação utiliza NestJS 11 com TypeScript em modo estrito, organizada como monólito modular e executada em um único processo Node.js com um único listener HTTP.

## Responsabilidades

O `hsc-auth-api` é responsável por:

- autenticação administrativa por Magic Link;
- sessões administrativas por cookie;
- autorização administrativa;
- autenticação de jogadores por e-mail e Steam OpenID;
- verificação de e-mail, login, recuperação de senha e linking de identidades;
- sessões de jogadores por cookie;
- resolução de identidade Steam verificada;
- conta HSC player-facing, profile e membership;
- gateway autenticado do Player Bunker;
- APIs administrativas de usuários, notícias, Seasons, player accounts e memberships;
- decisão interna de Server Access baseada em conta, identidade Steam e membership;
- APIs públicas de notícias e Seasons;
- uploads administrativos protegidos;
- publicação controlada de arquivos estáticos;
- cache de perfis Steam;
- health e readiness do banco de dados;
- acesso a MariaDB/MySQL;
- execução de migrations SQL por CLI separada.

## Papel no ecossistema HSC

Este repositório fornece serviços para outros componentes do HSC:

- `hsc-backoffice-admin` consome as APIs administrativas;
- `hsc-cs2-portal` consome autenticação de jogador, Player Bunker e conteúdo público;
- `hsc-cs2-etl` pode consumir contratos públicos ou internos relacionados a Seasons e perfis Steam;
- a Static API competitiva continua sendo materializada pelo ETL;
- a apresentação player-facing pertence ao Portal.

Este repositório não é:

- o Portal Angular;
- o Backoffice Angular;
- o ETL da Static API;
- o servidor CS2;
- o MatchZy;
- o Brand Hub;
- a configuração de Nginx, systemd, DNS ou TLS.

## Arquitetura

Stack principal:

```text
Node.js 22
NestJS 11
TypeScript strict
ES Modules
@nestjs/platform-express
MariaDB / MySQL
mysql2
SQL migrations
Cookie-based sessions
Steam OpenID
```

Princípios estruturais:

* monólito modular;
* um único processo de aplicação;
* um único listener HTTP;
* um único pipeline HTTP;
* configuração centralizada e validada;
* injeção de dependências por módulos NestJS;
* controllers responsáveis pelo transporte HTTP;
* services responsáveis por regras de aplicação;
* repositories responsáveis pela persistência;
* SQL nativo por meio de `mysql2`;
* migrations executadas fora do startup HTTP;
* nenhum ORM.

O Express é utilizado apenas como adaptador HTTP interno de `@nestjs/platform-express`.

## Módulos da aplicação

A aplicação está dividida nos seguintes módulos principais:

```text
CoreConfigModule
DatabaseModule
HealthModule

ContentNewsModule
ContentSeasonsModule

AdminAuthModule
AdminSchemaModule
AdminUsersModule
AdminNewsModule
AdminUploadsModule
AdminSeasonsModule
AdminMembershipModule
AdminPlayerAccountsModule

PlayerAuthModule
PlayerAccountModule
PlayerProfileModule
PlayerMembershipModule
PlayerBunkerModule
PlayerServerAccessModule

InternalSteamProfilesModule
ServerAccessModule
```

### Core e banco de dados

* `CoreConfigModule`: disponibiliza a configuração validada para os demais módulos;
* `DatabaseModule`: gerencia a pool `mysql2` e o ciclo de vida da conexão;
* `HealthModule`: expõe health e readiness da aplicação e do banco.

### Conteúdo público

* `ContentNewsModule`: leitura pública de notícias;
* `ContentSeasonsModule`: leitura pública de Seasons.

### Administração

* `AdminAuthModule`: sessão administrativa, Magic Link e bootstrap administrativo local;
* `AdminSchemaModule`: consulta administrativa de versão e tabelas do schema;
* `AdminUsersModule`: gerenciamento administrativo de usuários;
* `AdminNewsModule`: gerenciamento administrativo de notícias;
* `AdminUploadsModule`: upload protegido e publicação controlada de arquivos;
* `AdminSeasonsModule`: gerenciamento do ciclo de vida das Seasons;
* `AdminMembershipModule`: gerenciamento administrativo do lifecycle de memberships;
* `AdminPlayerAccountsModule`: leitura e ativação/desativação administrativa de contas player.

### Jogadores

* `PlayerAuthModule`: registration, verification, login, password reset, linking de e-mail/Steam, sessão e logout;
* `PlayerAccountModule`: resumo autenticado de conta e capacidades de identidade;
* `PlayerProfileModule`: profile próprio, visibilidade member-visible e mídia de avatar/banner;
* `PlayerMembershipModule`: leitura autenticada do membership efetivo da própria conta;
* `PlayerBunkerModule`: gateway autenticado e defensivo para dados competitivos materializados pelo ETL.
* `PlayerServerAccessModule`: decisão read-only de acesso ao servidor para a própria conta autenticada.

### Serviços internos

* `InternalSteamProfilesModule`: resolução e cache de perfis Steam para integrações autorizadas;
* `ServerAccessModule`: decisão fail-closed de acesso ao servidor a partir de SteamID64, conta ativa e membership efetivo.

## Estrutura principal

```text
index.js
src/
  bootstrap/
  config/
  nest/
    admin/
    content/
    core/
    database/
    health/
    internal/
    player/
    app.module.ts
    startApplication.ts
db/
  migrations/
scripts/
ops/
docs/
test/
```

Arquivos e diretórios relevantes:

* `index.js`: entrypoint minimalista;
* `src/bootstrap/runBootstrap.js`: carrega ambiente, valida configuração e inicia a aplicação compilada;
* `src/config/`: carregamento e validação centralizada da configuração;
* `src/nest/app.module.ts`: composition root modular do NestJS;
* `src/nest/startApplication.ts`: criação e inicialização da aplicação HTTP;
* `src/nest/database/`: infraestrutura de acesso ao MariaDB/MySQL;
* `db/migrations/`: migrations SQL numeradas;
* `scripts/migrate.js`: entrypoint CLI das migrations;
* `scripts/migrationRunner.js`: runner de migrations;
* `ops/`: scripts operacionais;
* `docs/`: documentação técnica e decisões arquiteturais;
* `.env.local.example`: referência segura de variáveis locais;
* `AGENTS.md`: regras operacionais para trabalho no repositório.

## Bootstrap

O fluxo de inicialização é:

```text
index.js
  └── runBootstrap()
        ├── carrega ENV_FILE ou .env
        ├── constrói e valida AppConfig
        ├── importa dist/nest/startApplication.js
        └── inicia a aplicação NestJS
```

A aplicação não deve realizar leituras dispersas de `process.env` dentro de controllers, services ou repositories.

A configuração validada é injetada por meio do container do NestJS.

Erros de configuração interrompem o startup e são registrados de forma sanitizada, sem expor segredos ou valores sensíveis.

## Desenvolvimento local

Ambiente local canônico:

```text
Windows
WSL 2
Ubuntu 24.04 LTS
Node.js 22 via NVM
npm 10
Docker Desktop com integração WSL
```

O projeto deve ser trabalhado no filesystem Linux do WSL.

Instale as dependências:

```bash
npm ci
```

Prepare o arquivo local de ambiente:

```bash
cp .env.local.example .env.local
```

Revise os valores de `.env.local` antes de iniciar a aplicação.

O arquivo `.env.local` é secreto e não deve ser commitado, impresso ou utilizado como fonte de exemplos de documentação.

## Banco de dados local

Quando necessário, o MariaDB local pode ser iniciado com o apoio do `docker-compose.yml`.

Antes de usar Docker, confirme que o compose e as variáveis apontam somente para ambiente local.

Execute as migrations:

```bash
ENV_FILE=.env.local npm run db:migrate
```

Uma segunda execução, sem migrations pendentes, deve finalizar sem reaplicar arquivos já registrados.

## Build

O código NestJS é escrito em TypeScript e precisa ser compilado antes da inicialização em um checkout limpo:

```bash
npm run build:nest
```

O build utiliza:

```text
tsconfig.nest.json
```

A saída compilada é gravada em:

```text
dist/nest/
```

O diretório `dist/` não é fonte de código e não deve ser editado manualmente.

## Inicialização local

Após configurar o ambiente, executar migrations e compilar:

```bash
ENV_FILE=.env.local npm start
```

O comando `npm start` executa:

```text
node index.js
```

Para sobrescrever a porta local pelo processo:

```bash
PORT=3101 ENV_FILE=.env.local npm start
```

## Comandos principais

```bash
npm ci
npm run build:nest
npm run db:migrate
npm start
npm test
ENV_FILE=.env.local npm run smoke:local
```

## Migrations

As migrations são arquivos SQL numerados em:

```text
db/migrations/
```

Regras:

* criar uma nova migration para cada mudança de schema;
* não editar migrations já aplicadas;
* manter arquivos idempotentes quando tecnicamente necessário;
* registrar migrations somente após execução bem-sucedida;
* executar migrations por CLI;
* não executar migrations automaticamente no startup HTTP;
* não habilitar `multipleStatements` nas conexões de runtime;
* não introduzir ORM sem decisão arquitetural explícita.

O runner utiliza uma conexão dedicada e uma tabela de controle:

```text
schema_migrations
```

Política detalhada:

```text
docs/db-migrations-policy.md
```

## Rotas e capacidades

Categorias principais:

```text
GET  /health

/auth/*
/admin/*

/content/news/*
/content/seasons/*

/player/auth/*
/player/account
/player/profile/*
/player/membership
/player/bunker/*
/player/server-access
/player/profiles/:slug

/internal/steam/*
/internal/server-access/*
/internal/match-bridge/*
```

## Match Bridge Protocol (Internal)

A Auth API expõe o protocolo de controle para o HSC Match Bridge:

- **Autenticação dedicada**: `x-hsc-bridge-key` (chave interna exclusiva por `bridgeNodeKey`, sem reutilizar chaves de Server Access);
- **Autoridade central**: o `bridgeNodeKey` é derivado exclusivamente do digest SHA-256 da credencial armazenada na tabela `match_bridge_nodes`;
- **Heartbeat**: `POST /internal/match-bridge/heartbeat` (atualiza apenas `last_seen_at` do nó autenticado);
- **Claim atômico**: `POST /internal/match-bridge/commands/claim` (claim FIFO atômico com lease de 30s, token aleatório e construção do Match Spec v1 a partir de snapshot congelado de `competitive_matches` e `competitive_match_roster`);
- **Resultado idempotente**: `POST /internal/match-bridge/commands/:commandId/result` (validação de lease ativo/correto; para `PREPARE_MATCH`, sucesso exige estritamente `resultCode = 'PREPARED'`);
- **Fronteira G1**: a confirmação `PREPARED` é evidência central de sucesso; não avança a sala para `JOINABLE` nem altera `match_server_assignments`.


O README não define o contrato completo de cada endpoint.

Contratos HTTP, cookies, redirects, códigos de status e payloads devem ser consultados no código e na documentação específica antes de qualquer alteração.

## Fronteiras de autenticação

Admin Auth e Player Auth são domínios separados.

Não devem compartilhar:

* cookies;
* sessões;
* guards;
* tabelas;
* semântica de identidade;
* autorização;
* RBAC.

Cookies conhecidos:

```text
hsc_admin_session
hsc_player_session
```

Tokens, cookies, hashes de sessão, chaves administrativas e credenciais nunca devem ser impressos em logs, README, issues ou pull requests.

## Conta, identidade, profile e membership

O domínio player-facing mantém conceitos separados:

```text
Account ≠ auth method ≠ profile ≠ membership
```

Uma conta HSC pode autenticar por e-mail e posteriormente vincular Steam.

O SteamID64 nunca é aceito como identidade manualmente declarada. A posse da identidade Steam é comprovada pelo fluxo Steam OpenID antes do vínculo.

Capacidades dependentes de CS2 exigem identidade Steam vinculada/verificada.

Membership é um estado próprio da conta e não é sinônimo de método de autenticação ou profile.

Contratos principais:

```text
GET   /player/account
GET   /player/profile/me
PATCH /player/profile/me
GET   /player/profiles/:slug
GET   /player/membership
```

Administração relacionada:

```text
GET   /admin/player-accounts
GET   /admin/player-accounts/:id
PATCH /admin/player-accounts/:id

POST /admin/memberships
GET  /admin/memberships/:id
GET  /admin/memberships/by-player/:playerAccountId
POST /admin/memberships/:id/activate
POST /admin/memberships/:id/suspend
POST /admin/memberships/:id/reactivate
POST /admin/memberships/:id/cancel
```

O profile com visibilidade `public` é member-visible: pode ser lido por qualquer usuário HSC autenticado. Ele não é público para a Internet.

## Server Access

A decisão interna de acesso ao servidor segue:

```text
SteamID64
→ identidade Steam vinculada?
→ player account ativa?
→ membership efetivo ativo?
→ authorized = true
```

Qualquer condição ausente ou inválida falha de forma fechada.

Contrato:

```text
POST /internal/server-access/authorize
```

O player autenticado consulta a mesma decisão autoritativa, sem fornecer SteamID64 ou credencial interna:

```text
GET /player/server-access
```

Esse contrato utiliza credencial própria, separada da integração de Steam Profiles.

A Auth API decide elegibilidade; integração futura com plugin/servidor CS2 permanece fora deste repositório.

## Player Bunker

A Auth API atua como gateway autenticado do Player Bunker.

Ela pode:

* autenticar o jogador;
* resolver o SteamID64 autenticado;
* ler artefatos preparados pelo ETL;
* sanitizar payloads;
* retornar respostas defensivas;
* enriquecer a identidade Steam quando houver fonte autorizada.

Ela não pode:

* recalcular ranking;
* recalcular score;
* recalcular elegibilidade competitiva;
* inferir participação em Season;
* modificar artefatos do ETL;
* publicar artefatos competitivos;
* consultar diretamente o banco MatchZy;
* consultar diretamente o servidor CS2.

O ETL é a fonte de materialização das estatísticas competitivas.

## Uploads

Uploads administrativos devem permanecer protegidos por autenticação e autorização.

Arquivos publicados pelo runtime recebem controles como:

```text
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable
```

A publicação de arquivos não deve permitir:

* path traversal;
* dotfiles;
* index automático;
* sobrescrita arbitrária;
* exposição de caminhos locais;
* bypass de autenticação administrativa.

Documentação:

```text
docs/admin/uploads.md
```

## Perfis Steam

O cache de perfis Steam é responsabilidade da Auth API.

A identidade canônica deve preservar:

* SteamID64;
* nome atual do perfil Steam;
* avatar autorizado;
* URL pública do perfil, quando disponível.

O SteamID64 é a identidade imutável. Nome e avatar são atributos mutáveis do perfil.

Documentação:

```text
docs/steam-profiles.md
```

## Configuração

Não documente valores reais de variáveis de ambiente.

Use apenas:

```text
.env.local.example
```

Categorias de configuração:

* runtime e porta;
* banco de dados;
* CORS;
* Admin Auth;
* Magic Link e SMTP;
* Steam API e Steam OpenID;
* Player Auth;
* uploads;
* Player Bunker;
* APIs internas.

Variáveis fornecidas diretamente ao processo têm precedência sobre o arquivo carregado por `ENV_FILE`.

## Validação local

Para mudanças em código NestJS:

```bash
npm run build:nest
npm test
git diff --check
git diff --stat
git status --short
```

Para mudanças exclusivamente documentais:

```bash
git diff --check
git diff --stat
git status --short
```

Smokes, migrations e processos completos devem ser executados somente quando relevantes para a alteração.

Não utilize scripts de deploy ou release como validação local.

## Segurança

* nunca commitar `.env` ou `.env.local`;
* nunca registrar segredos em logs;
* nunca expor cookies ou tokens;
* nunca imprimir credenciais de banco;
* proteger mutações player baseadas em cookie com a política CSRF definida pelo domínio;
* preservar rate limiting dos fluxos de autenticação e identidade;
* preservar state browser-bound no login Steam OpenID;
* manter credenciais internas de Steam Profiles e Server Access separadas;
* nunca alterar contratos de autenticação como efeito colateral;
* nunca executar migrations de produção sem aprovação explícita;
* nunca executar deploy, release ou rollback sem aprovação explícita;
* não adicionar ou atualizar dependências sem revisão;
* não executar `npm audit fix --force`;
* preservar a separação entre Admin Auth e Player Auth;
* preservar a fronteira read-only do Player Bunker;
* seguir `AGENTS.md`.

## Documentação relacionada

Decisões arquiteturais:

* `docs/adr/0001-nestjs-modular-monolith-and-atomic-cutover.md`
* `docs/adr/0002-direct-nestjs-replacement.md`

Banco de dados:

* `docs/db-migrations-policy.md`

Funcionalidades e operação local:

* `docs/admin/uploads.md`
* `docs/steam-profiles.md`
* `docs/local-smoke.md`
* `docs/player-bunker-artifact-env-runbook.md`

Governança operacional:

* `AGENTS.md`

Documentação canônica externa:

* `hsc-docs/docs/00-governance/hsc-repositories-map.md`
* `hsc-docs/docs/04-infra-aws-lightsail/auth-api-operations.md`
* `hsc-docs/docs/04-infra-aws-lightsail/deploy-release-rollback.md`
* `hsc-docs/docs/05-backoffice-admin/admin-api-contracts.md`

## Workflow

* partir de `main` sincronizada e limpa;
* trabalhar em branch específica;
* manter alterações pequenas e focadas;
* não misturar documentação, runtime e infraestrutura sem necessidade;
* revisar o diff antes do commit;
* executar apenas as validações relevantes;
* commit, push, PR, merge, release e deploy são ações humanas;
* produção exige autorização explícita.
