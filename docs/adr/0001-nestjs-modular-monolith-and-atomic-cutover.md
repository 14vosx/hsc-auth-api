# ADR 0001 — NestJS Modular Monolith and Atomic HTTP Cutover

## Metadados

- **Data:** 2026-08-06
- **Repositório:** `14vosx/hsc-auth-api`
- **Base:** `1da008175e3e0746b2068f71adb58532aabe2e29`
- **Autoridade:** Decisão aprovada pelo responsável humano do projeto.

## Status

Accepted

*Decisão aprovada pelo responsável humano do projeto. Este status torna-se efetivo com o merge deste ADR na branch `main`.*

## Contexto

O `hsc-auth-api` é a API de autenticação e conteúdo do ecossistema HSC. Atualmente, a aplicação opera em runtime Node.js 22 com ES Modules (ESM) e framework HTTP Express 5. As responsabilidades da aplicação incluem:

- Autenticação e sessão administrativa por Cookie (`hsc_admin_session`) via Magic Link;
- Autenticação de jogadores baseada em Steam OpenID e sessão por Cookie (`hsc_player_session`);
- Gateway autenticado do Player Bunker com leitura em modo somente-leitura de artefatos estáticos no diretório raiz de artefatos;
- APIs administrativas e públicas de conteúdo (News e Seasons);
- Servidão controlada e protegida de uploads de arquivos estáticos;
- Cache e resolução de perfis Steam;
- Persistência em banco de dados MariaDB/MySQL acessado via driver `mysql2` com migrations SQL puras.

O Gate 0A-01 estabeleceu uma base estável ao introduzir um fluxo de bootstrap determinístico com pré-carregamento e validação de ambiente (`src/bootstrap/runBootstrap.js` e `src/config/appConfig.js`), correção do runner de migrations e aprovação da suíte completa de testes (com baseline registrada de 294 testes).

A arquitetura-alvo definida para a evolução da aplicação é a migração para o framework NestJS 11 em TypeScript estrito (`strict`), mantendo a estrutura de monólito modular e preservando a fidelidade dos contratos HTTP observáveis.

## Problema

A estrutura atual baseada em rotas e manipuladores Express desacoplados de forma manual apresentou limitações de sustentabilidade a longo prazo para organização modular, tipagem estrita de dependências e padronização da arquitetura de injeção de dependências.

No entanto, realizar uma reescrita do tipo "big bang" apresenta riscos de regressão em autenticação, cookies, sessões, RBAC e integração com serviços dependentes (`hsc-backoffice-admin`, `hsc-cs2-portal`, `hsc-cs2-etl`). Por outro lado, tentar executar a coexistência simultânea de aplicações em produção (por meio de montagem subordinada de servidores ou execução de múltiplos ouvintes HTTP com proxy) introduz complexidade operacional, pontos cegos de depuração, overhead de memória em ambiente local e VPS, e riscos de colisão de cookies, CORS e gerenciamento de erros.

Dessa forma, o problema central consiste em: como transicionar a aplicação para a arquitetura NestJS com redução controlada de risco e sem duplicar aplicações ativas em produção, garantindo a paridade dos contratos catalogados sem introduzir a complexidade de múltiplos pipelines HTTP ativos simultaneamente.

## Forças de decisão

As seguintes forças moldaram esta decisão arquitetural:

- **Desenvolvedor Solo (Economia de Execução e Custo)**: O projeto é mantido por um desenvolvedor solo. O consumo de memória, CPU, contexto de IA e complexidade de manutenção deve ser minimizado. Soluções que exigem múltiplos processos simultâneos, proxies temporários ou orquestração complexa de infraestrutura em ambiente local ou VPS devem ser descartadas.
- **Preservação dos Contratos HTTP**: Nenhuma rota, método, status code, payload JSON, cookie, tempo de expiração ou header de segurança pode ser alterado inadvertidamente como efeito colateral da migração.
- **Transparência e Prevenção de Débito Técnico**: Arquivos legados e soluções temporárias "para remover depois" não podem ser integrados à branch principal (`main`). O corte para o NestJS deve ser atômico na substituição do transporte.
- **Isolamento de Segurança e Autenticação**: Admin Auth, Player Auth e Player Bunker são domínios críticos com políticas de cookies e tokens sensíveis, exigindo verificação de paridade antes da substituição final do meio de transporte.
- **Independência de Migrations e Banco de Dados**: O schema do banco MariaDB, o driver `mysql2` e o executor CLI de migrations SQL nativas funcionam corretamente e não devem ser acoplados ao ciclo de vida do framework NestJS.

## Decisão

Fica estabelecido que a migração da `hsc-auth-api` para o **NestJS 11** será realizada adotando um modelo de **Monólito Modular** com **Corte HTTP Atômico (Atomic HTTP Cutover)**.

Fica expressamente decidido que a transição **não utilizará coexistência de aplicações HTTP na branch main ou em produção**.

NestJS será o único framework proprietário da aplicação e do pipeline HTTP, utilizando inicialmente o Express adapter (`@nestjs/platform-express`). O transporte e a composição Express legados serão removidos no corte.

Regras de execução:
- Durante a fase de preparação e desacoplamento, a branch `main` e o ambiente de produção executarão **exclusivamente a aplicação Express legada**.
- O desenvolvimento da aplicação NestJS ocorrerá de forma isolada em branches de trabalho e worktrees dedicadas, validadas contra a mesma suíte de testes de caracterização de contratos HTTP.
- O corte ocorrerá em um único Gate atômico (Gate 0A-06), no qual a composição e os manipuladores da aplicação Express legada serão removidos, e o NestJS passará a ser o único framework proprietário da aplicação e do pipeline HTTP.

## Arquitetura-alvo

A arquitetura-alvo da aplicação é definida pelos seguintes pilares:

- **Framework:** NestJS 11;
- **Linguagem:** TypeScript em modo estrito (`strict: true`);
- **Adaptador HTTP:** Express adapter (`@nestjs/platform-express`) inicialmente, sem introdução de Fastify neste estágio;
- **Topologia:** Monólito Modular (sem divisão em microserviços);
- **Banco de Dados:** MariaDB / MySQL mantido com o driver nativo `mysql2`;
- **Gerenciamento de Schema:** Migrations SQL puras existentes via script CLI separado;
- **Contratos HTTP:** Preservados com alta fidelidade em rotas, status, headers, payloads e cookies;
- **Runtime Process:** Um único processo Node.js, um único listener na porta configurada e um único pipeline HTTP proprietário ativo.

## Estratégia de transição

A transição será executada seguindo a sequência conceitual abaixo:

1. **Caracterização Contratual do Express:** Implementar uma suíte abrangente de testes de caracterização de contratos HTTP que exercite a aplicação Express atual em todos os seus cenários públicos, administrativos e de autenticação.
2. **Extração do Núcleo Framework-Agnostic:** Refatorar o código existente para separar as regras de negócio, validadores, lógica de sessão e repositórios em componentes puros e independentes de framework (serviços de aplicação e repositórios de domínio).
3. **Manutenção da Aplicação Legada:** Durante a fase de extração, a branch `main` continuará executando exclusivamente a aplicação Express legada.
4. **Construção Isolada em Branch/Worktree:** A aplicação NestJS será construída em branch/worktree isolada, importando o núcleo framework-agnostic refatorado e expondo as rotas via Controllers e Módulos nativos do NestJS.
5. **Validação Cruzada de Paridade:** Executar a exata mesma suíte de testes de caracterização contratual contra as duas implementações.
6. **Aprovação Humana e Gate de Paridade:** O corte somente poderá ser agendado após a aprovação explícita do responsável humano e alcance dos critérios de paridade nos testes.
7. **Corte Atômico (Atomic Cutover):** Executar um merge atômico que:
   - Ativa o NestJS como novo framework proprietário da aplicação e do pipeline HTTP;
   - Remove o arquivo de transporte `src/app/startApplication.js` e a composição da aplicação Express legada;
   - Remove os registradores de rotas Express em `src/routes/`;
   - Remove o composition root legado (`src/app/context.js`);
   - Remove middlewares e utilitários legados sem consumidores;
   - Purga arquivos e imports mortos.
8. **Estratégia de Rollback:** Em caso de anomalia pós-corte, o rollback será realizado via reversão de merge/deploy do commit atômico no repositório.

*Nota de Isolamento:* A branch de implementação do NestJS poderá conter temporariamente arquivos legados da aplicação Express exclusivamente para fins de comparação e portabilidade durante o desenvolvimento local. Tais arquivos não serão integrados na `main`, não farão fallback de rotas e não serão mantidos após a conclusão do corte.

## Proibição de coexistência de runtimes

Fica estritamente **proibida** a coexistência de aplicações ou pipelines HTTP:

- No mesmo processo de aplicação;
- No mesmo deployment;
- Na branch `main` publicada;
- Em ambiente de produção;
- Por mecanismo de fallback ou roteamento dividido.

São proibidas as seguintes práticas:
1. Montar a aplicação ou middlewares do Express legado dentro da instância do NestJS;
2. Montar o aplicativo ou controllers do NestJS dentro da aplicação Express legada;
3. Implementar mecanismos de fallback de rotas não encontradas de uma aplicação para outra;
4. Executar dois ou mais processos Node.js / HTTP para a mesma aplicação em produção;
5. Utilizar duas ou mais portas HTTP no mesmo ambiente para dividir rotas;
6. Adicionar proxy reverso temporário ou middleware de roteamento dinâmico para alternar tráfego;
7. Manter pipelines duplicados para tratamento de CORS, cookies ou captura global de erros;
8. Integrar parcialmente controllers NestJS na branch `main` mantendo a aplicação Express legada ativa;
9. Deixar arquivos legados do Express marcados como "para remover depois" na árvore de código após a realização do corte.

*Esclarecimento sobre Testes:* Testes locais isolados podem executar, de forma separada ou sequencial, a aplicação Express legada e a aplicação NestJS candidata exclusivamente para comparação automatizada de paridade. Isso não autoriza montagem híbrida nem publicação simultânea de dois runtimes.

## Bootstrap e configuração

A arquitetura de bootstrap seguro estabelecida no Gate 0A-01 será rigorosamente preservada:

```text
index.js
  └── runBootstrap()
        ├── loadEnv()
        ├── buildAppConfig(process.env)
        ├── Import dinâmico do composition root
        └── Início da aplicação
```

### Regras de Configuração no NestJS:
- O objeto validado e congelado no nível superior por `Object.freeze` (retornado por `buildAppConfig(process.env)`) será a **única e exclusiva fonte de configuração validada** para a aplicação NestJS.
- O objeto de configuração será disponibilizado no container de injeção de dependências do NestJS através de um Custom Provider com Injection Token dedicado (ex: `APP_CONFIG`).
- O congelamento profundo (*deep freeze*) ou o uso de propriedades TypeScript `readonly` poderão ser avaliados durante a implementação, sem duplicar a fonte de configuração.
- Fica proibida a segunda leitura de arquivos `.env` ou chamadas diretas a `process.env` dentro de módulos, controllers ou serviços da aplicação NestJS.
- Fica proibida a duplicação das regras de validação de ambiente.
- Não será adotado o pacote `@nestjs/config` nesta fase, mantendo a validação centralizada e sanitizada existente em `src/config/appConfig.js`.
- O caminho e o nome exato do composition root NestJS serão definidos no Gate de implementação correspondente (não antecipando `src/main.ts` nesta etapa).
- Caso ocorra falha de configuração na inicialização, a aplicação interromperá o startup com mensagem sanitizada em stderr e definirá código de saída diferente de zero (`process.exitCode = 1`).

## Banco de dados e migrations

As definições para a camada de persistência são:

- O driver `mysql2` e a base MariaDB permanecem como a infraestrutura oficial de banco de dados.
- Migrations já aplicadas não podem ser editadas; novas evoluções de schema continuarão sendo entregues por novas migrations SQL numeradas.
- O comando `npm run db:migrate` continuará sendo uma **operação de linha de comando (CLI) totalmente separada** da aplicação HTTP.
- Os scripts `scripts/migrate.js` e `scripts/migrationRunner.js` **não pertencem ao ciclo de vida HTTP do NestJS** e não serão invocados durante a inicialização do servidor.
- É proibida a execução automática de migrations durante o startup da aplicação HTTP em qualquer ambiente.
- Não será introduzido nenhum ORM (como TypeORM, Prisma ou MikroORM) durante a migração NestJS.
- O futuro `DatabaseModule` no NestJS proverá unicamente a infraestrutura de injeção da pool de conexões `mysql2`, preservando transações e consultas SQL nativas.
- Verificações de prontidão (readiness) e checagens de compatibilidade de schema do banco continuarão operando via callbacks assíncronos ou verificações de health separadas.

## Núcleo framework-agnostic

A fase de extração prévia (Gate 0A-04) reorganizará a lógica de negócio em um núcleo framework-agnostic. Componentes de aplicação, serviços de domínio e repositórios não deverão possuir dependências diretas de:

- Objeto de requisição Express (`req` / `Request`);
- Objeto de resposta Express (`res` / `Response`);
- Roteadores do Express (`express.Router`);
- Decorators nativos do NestJS (`@Controller`, `@Injectable`, `@Get`, etc.);
- Exceções do NestJS (`HttpException`, `BadRequestException`);
- Quaisquer objetos globais específicos de transporte HTTP.

Os adaptadores HTTP (tanto os registradores Express atuais quanto os Controllers NestJS futuros) atuarão estritamente como a camada de transporte, responsáveis por traduzir parâmetros HTTP de entrada para o núcleo e serializar as respostas do núcleo para o contrato HTTP final.

Não é exigida uma arquitetura hexagonal complexa ou abstrações artificiais desnecessárias. A separação deve ocorrer apenas nas fronteiras justificadas pelas regras de negócio e pelos testes de caracterização.

## Fronteiras de módulos

A aplicação NestJS será organizada nas seguintes fronteiras modulares lógicas no monólito:

1. **CoreConfigModule:** Provedor global do `APP_CONFIG`, contendo a configuração validada e congelada no nível superior.
2. **DatabaseModule:** Provedor da pool de conexões `mysql2` e gerenciador do ciclo de vida de conexão.
3. **HealthModule:** Endpoint `GET /health` e checagem de prontidão do banco.
4. **ContentNewsModule:** Endpoints públicos de notícias (`GET /content/news`, `GET /content/news/:slug`).
5. **ContentSeasonsModule:** Endpoints públicos de temporadas (`GET /content/seasons`, `GET /content/seasons/:slug`).
6. **AdminAuthModule:** Solicitação e consumo de Magic Link, gerenciamento de tokens e cookies `hsc_admin_session`.
7. **AdminUsersModule:** Gestão de usuários administrativos e RBAC (`requireAdmin`).
8. **AdminNewsModule:** Endpoints de administração e publicação de notícias.
9. **AdminSeasonsModule:** Endpoints de administração, ativação e arquivamento de temporadas.
10. **AdminUploadsModule:** Upload e servidão controlada de arquivos estáticos.
11. **SteamProfilesModule:** Cache e resolução de perfis Steam internos (`POST /internal/steam/profiles/resolve`).
12. **PlayerAuthModule:** Autenticação OpenID da Steam, emissão de cookie `hsc_player_session` e perfil do jogador (`GET /player/me`, `POST /player/auth/logout`).
13. **PlayerBunkerModule:** Endpoint `/player/bunker/summary` com leitura defensiva de artefatos JSON no diretório raiz de artefatos.

## Contratos congelados

A relação de endpoints apresentada a seguir constitui o inventário contratual inicial da aplicação, devendo ser confirmada e complementada pela caracterização HTTP do Gate 0A-03. Uma eventual omissão documental não autoriza a remoção de comportamento observável existente.

### 1. Health
- `GET /health`

### 2. Player Auth & Bunker
- `GET /player/auth/steam/start`
- `GET /player/auth/steam/callback`
- `POST /player/auth/logout`
- `GET /player/me`
- `GET /player/bunker/summary`

### 3. Magic Link & Admin Auth
- `POST /auth/magic-link/request`
- `POST /auth/request-link` *(alias mantido obrigatoriamente enquanto fizer parte do contrato atual)*
- `GET /auth/magic-link/consume`
- `GET /auth/session`
- `POST /auth/dev/bootstrap-session`

### 4. Conteúdo Público (News & Seasons)
- `GET /content/news`
- `GET /content/news/:slug`
- `GET /content/seasons`
- `GET /content/seasons/:slug`

### 5. Internal APIs
- `POST /internal/steam/profiles/resolve`

### 6. Admin APIs (Users, Schema, News, Seasons, Uploads)
- `GET /admin/schema`
- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`
- `GET /admin/news`
- `POST /admin/news`
- `GET /admin/news/:id`
- `PATCH /admin/news/:id`
- `DELETE /admin/news/:id`
- `POST /admin/news/:id/publish`
- `POST /admin/news/:id/unpublish`
- `POST /admin/uploads`
- `GET /admin/seasons`
- `POST /admin/seasons`
- `GET /admin/seasons/:slug`
- `PATCH /admin/seasons/:slug`
- `POST /admin/seasons/:slug/activate`
- `POST /admin/seasons/:slug/archive`

### 7. Arquivos Estáticos / Uploads
- `GET /uploads/*` *(servido com headers obrigatórios `X-Content-Type-Options: nosniff` e `Cache-Control: public, max-age=31536000, immutable`)*

### Endpoints Inexistentes ou Removidos (Fica proibido registrar):
- `/player/auth/steam/login` *(não existe no contrato atual; a rota correta é `/player/auth/steam/start`)*;
- `/player/logout` *(não existe no contrato atual; a rota correta é `/player/auth/logout`)*;
- `POST /auth/magic-link/consume` *(não existe; consumo ocorre via `GET /auth/magic-link/consume`)*;
- `/auth/consume-magic-link` *(não existe no contrato atual)*.

## Estratégia de testes

O Gate 0A-03 focará na criação da suíte de caracterização contratual HTTP executada sobre a aplicação Express legada.

### Cobertura Mínima Obrigatória:
- Resposta e estrutura do `GET /health`;
- Configuração de CORS e resposta a rotas preflight (`OPTIONS`);
- Mapeamento correto de verbos e caminhos das rotas públicas e privadas;
- Preservação dos aliases de rotas (ex: `/auth/request-link`);
- Status codes HTTP em cenários de sucesso, erro de validação e erro interno;
- Formato e chaves dos payloads JSON de resposta;
- Nomes, flags e políticas dos cookies de Admin (`hsc_admin_session`) e Player (`hsc_player_session`);
- Comportamento de redirecionamento do Magic Link;
- Redirecionamentos e parâmetros no fluxo OpenID da Steam;
- Uploads de arquivos, salvamento e headers HTTP de arquivos estáticos;
- Tratamento de rotas inexistentes (404);
- Respostas de erro sanitizadas (sem vazamento de dados de infraestrutura ou stack traces);
- Comportamento defensivo do Player Bunker em caso de arquivo ausente ou inválido.

*Decisão de Dependência:* A escolha da biblioteca técnica para execução dos testes de contrato HTTP (ex: `fetch` nativo com servidor em background, `supertest` ou outra ferramenta) será tomada no Gate 0A-03 após avaliação de custo e dependências pelo responsável humano. O presente ADR não fixa a biblioteca técnica como decisão encerrada.

## Sequência de Gates

A transição incremental do repositório seguirá a sequência oficial de Gates aprovada:

```text
Gate 0A-02 (ATUAL)
  └── Definição documental do ADR: NestJS em monólito modular e corte atômico, sem coexistência de runtimes em produção.

Gate 0A-03
  └── Caracterização HTTP completa e definição das fronteiras transport-agnostic.

Gate 0A-04
  └── Desacoplamento incremental do núcleo de regras de negócio ainda sob o runtime Express.

Gate 0A-05
  └── Implementação NestJS isolada em branch/worktree e validação de paridade contratual.

Gate 0A-06
  └── Remoção da composição Express legada, desativação de código morto e corte atômico do transporte.
```

*Subgates de Auth:* Os domínios de Admin Auth, Player Auth e Player Bunker possuirão verificações de paridade obrigatórias antes da execução do corte no Gate 0A-06.

## Critérios de entrada do Gate 0A-03

Para que o Gate 0A-03 seja iniciado, os seguintes critérios devem ser satisfeitos:

1. Este ADR (`docs/adr/0001-nestjs-modular-monolith-and-atomic-cutover.md`) aprovado e mergeado na branch `main`;
2. Branch `main` limpa e com a suíte completa existente passando (a baseline registrada na aprovação deste ADR era de 294 testes);
3. Aprovação explícita do responsável humano para iniciar a escrita da suíte de caracterização HTTP.

## Critérios de bloqueio do corte

O corte atômico no Gate 0A-06 **será sumariamente bloqueado** caso seja identificada qualquer uma das seguintes condições:

- Existência de qualquer rota atendida por Express e NestJS simultaneamente na mesma aplicação;
- Existência de mecanismo de fallback de rota para a aplicação legada;
- Presença de segundo ouvinte (listener) HTTP ou segunda porta configurada no deployment;
- Leitura de configurações por dois mecanismos distintos;
- Existência de middlewares duplicados na aplicação ativa;
- Presença de dependências npm sem uso comprovado no projeto;
- Existência de arquivos legados mantidos no repositório sem consumidor identificado;
- Divergência em qualquer contrato HTTP catalogado (status, payload, header ou cookie);
- Falha em qualquer teste da suíte de caracterização ou regressão;
- Presença de comentários no código do tipo "remover depois" sem indicação de responsável e Gate;
- Execução automática de migrations no startup do servidor.

## Critérios de conclusão do Gate 0A-06

O Gate 0A-06 e a migração NestJS serão considerados concluídos apenas quando:

1. O framework NestJS for o único framework proprietário da aplicação e do pipeline HTTP;
2. O arquivo de transporte `src/app/startApplication.js` e a composição Express legada tiverem sido excluídos;
3. Todos os registradores de rotas legados em `src/routes/` tiverem sido removidos ou substituídos por Módulos/Controllers NestJS;
4. Todos os imports e arquivos mortos tiverem sido purgados do repositório;
5. A necessidade direta do pacote `express` for reavaliada considerando `@nestjs/platform-express` e dependências sem uso forem desinstaladas;
6. A configuração validada da aplicação possuir uma única fonte (`buildAppConfig`);
7. As migrations SQL continuarem funcionando exclusivamente via CLI (`npm run db:migrate`);
8. A suíte completa de caracterização contratual e testes de regressão passar com sucesso;
9. O script de smoke test local passar sem erros;
10. O procedimento de rollback estiver testado e documentado.

## Rollback

Caso ocorra alguma falha pós-corte em produção:

- **Estratégia Principal:** O rollback será atômico, realizado mediante o procedimento padrão de reversão de merge/deploy do commit de corte no Git.
- **Compatibilidade de Banco de Dados:** O Gate 0A-06 não poderá introduzir alteração de schema destrutiva ou incompatível com a revisão usada para rollback. A compatibilidade reversa deverá ser comprovada; caso isso não seja possível, deverá existir um plano específico de rollback de schema/dados aprovado antes do corte.
- **Restauração:** O deploy da revisão anterior restaurará a aplicação Express legada com base no plano de compatibilidade aprovado.

## Alternativas rejeitadas

As seguintes alternativas técnicas foram analisadas e rejeitadas:

1. **NestJS principal com Express subordinado:**
   - *Motivo da Rejeição:* Rejeitado pelo responsável humano. Introduz complexidade desnecessária, duplicidade de middlewares e riscos de colisão em gerenciamento de erros e cookies para um projeto mantido por desenvolvedor solo.
2. **Express principal com NestJS montado internamente:**
   - *Motivo da Rejeição:* Rejeitado por criar uma arquitetura híbrida não convencional, prejudicando o uso natural de decorators e lifecycle do NestJS.
3. **Dois processos HTTP com proxy reverso:**
   - *Motivo da Rejeição:* Rejeitado por exigir múltiplos processos, aumento de consumo de memória (incompatível com ambiente local e VPS) e gerenciamento de proxy adicional.
4. **Reescrita Big Bang sem caracterização prévia:**
   - *Motivo da Rejeição:* Rejeitada pelo risco de introduzir regressões silenciosas em rotas de autenticação e conteúdo.
5. **Adoção de Microserviços:**
   - *Motivo da Rejeição:* Rejeitada por violar o escopo do projeto. A aplicação deve permanecer um Monólito Modular.
6. **Introdução de ORM (TypeORM / Prisma) durante a migração:**
   - *Motivo da Rejeição:* Rejeitada por adicionar complexidade e alterações de banco desnecessárias ao objetivo principal de migração do framework HTTP.
7. **Migrations automáticas durante o startup do servidor:**
   - *Motivo da Rejeição:* Rejeitada por violar as políticas operacionais e de segurança de banco de dados definidas em `AGENTS.md`.

## Consequências positivas

- **Padronização Arquitetural:** Estruturação em módulos, controllers e serviços nativos do NestJS 11 com tipagem TypeScript estrita.
- **Ausência de Overhead Causado por Arquitetura Híbrida:** Manutenção de um único pipeline HTTP limpo e sem camadas intermediárias de proxy ou runtime híbrido.
- **Redução Controlada de Risco:** Compatibilidade verificada pela suíte de caracterização executada antes e depois do corte.
- **Procedimento Claro de Rollback:** Procedimento claro de rollback por reversão de merge/deploy, condicionado à compatibilidade reversa de schema comprovada ou à existência de plano específico de rollback de schema/dados previamente aprovado.

## Consequências e custos

- **Esforço Inicial de Caracterização:** Necessidade de investir esforço no Gate 0A-03 para construir a suíte de testes de contratos HTTP.
- **Disciplina de Manutenção em Branch Separada:** A implementação do NestJS no Gate 0A-05 exigirá manter a branch de migração sincronizada com a `main` até a autorização do corte atômico.
- **Movimentação pontual de arquivos:** Modificações na localização física de repositórios (como `seasons.repo.js`) só ocorrerão no Gate do respectivo domínio.

## Decisões adiadas

As seguintes decisões ficam formalmente adiadas para Gates futuros e não fazem parte do escopo atual:

- Adoção de ORM para substituir consultas SQL nativas no `mysql2`;
- Substituição do driver `mysql2`;
- Avaliação do adaptador Fastify em substituição ao Express adapter;
- Divisão da aplicação em microserviços;
- Implementação de funcionalidades de billing ou entitlements (somente após estabilidade da fundação NestJS);
- Alterações de schema de banco de dados não relacionadas à migração;
- Reorganização completa da estrutura de diretórios do repositório;
- Remoção definitiva do pacote npm `express` antes do corte (sua necessidade direta será reavaliada no Gate 0A-06 considerando `@nestjs/platform-express`);
- Escolha da biblioteca de testes HTTP para o Gate 0A-03.

## Referências internas

- `AGENTS.md` (Versão 2.1 — Regras operacionais do repositório)
- `README.md` (Visão geral da API)
- `docs/config-bootstrap.md` (Documentação da arquitetura de bootstrap e configuração)
- `docs/db-migrations-policy.md` (Política de migrations locais e de banco de dados)
