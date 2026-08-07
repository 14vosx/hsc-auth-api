# AGENTS.md — HSC Auth API

**Versão:** 2.2
**Data:** 2026-08-06
**Repositório:** `14vosx/hsc-auth-api`

## 1. Finalidade e autoridade

Este arquivo define as regras operacionais para agentes de IA que atuem neste repositório.

Ordem de autoridade:

1. instrução explícita do responsável humano pelo projeto;
2. documento de Gate ou especificação aprovada para a tarefa atual;
3. este `AGENTS.md`;
4. documentação local do repositório;
5. convenções existentes no código.

Em caso de conflito, o agente deve parar, explicar o conflito de forma objetiva e solicitar decisão humana.

O responsável humano pelo projeto é a autoridade final sobre:

- arquitetura;
- produto;
- segurança;
- contratos;
- infraestrutura;
- dados;
- deploy;
- release;
- rollback;
- Git;
- custos;
- priorização.

## 2. Contexto do projeto

O `hsc-auth-api` é a API de autenticação, identidade, conteúdo e acesso autenticado do HSC.

Stack principal:

```text
Node.js 22
ES Modules
NestJS 11
TypeScript strict
@nestjs/platform-express
MySQL/MariaDB via mysql2
SQL migrations
Cookie-based sessions
Magic link authentication for Admin Auth
Steam-first Player Auth
Admin/content APIs
Player-facing Bunker APIs
Steam Profiles cache
```

Áreas relevantes:

```text
index.js
src/bootstrap
src/config
src/nest
db/migrations
scripts
ops
docs
test
```

Responsabilidades atuais:

```text
Admin Auth
Admin/content APIs
News/Seasons content APIs
Steam Profiles cache
Player Auth
Player Bunker authenticated gateway
Uploads controlados pela Auth API
```

Este repositório não é:

```text
Portal Angular
Backoffice Angular
ETL da Static API
servidor CS2
MatchZy
infraestrutura AWS
configuração Nginx/systemd/DNS/TLS
```

### 2.1. Arquitetura atual aprovada

A arquitetura atual do `hsc-auth-api` é:

```text
NestJS 11
TypeScript strict
@nestjs/platform-express
monólito modular
MariaDB
mysql2
SQL migrations executadas por CLI
contratos HTTP preservados
um único processo Node.js
um único listener HTTP
um único pipeline HTTP
```

Regras:

- NestJS é o único proprietário da aplicação e do pipeline HTTP;
- o Express é utilizado somente como adaptador interno de `@nestjs/platform-express`;
- não montar aplicações HTTP adicionais dentro do NestJS;
- não introduzir fallback entre frameworks;
- não dividir rotas entre processos ou listeners;
- não introduzir microserviços sem decisão arquitetural explícita;
- não trocar simultaneamente banco, driver, migrations ou adaptador HTTP;
- não alterar cookies, sessões, rotas, status codes ou payloads como efeito colateral;
- preservar a separação entre Admin Auth, Player Auth e Player Bunker;
- manter MariaDB/MySQL com `mysql2` e SQL nativo;
- manter migrations separadas do startup HTTP;
- não introduzir ORM sem decisão arquitetural explícita;
- decisões arquiteturais devem ser registradas em ADR ou documento aprovado.

## 3. Modelo operacional do projeto

### 3.1. Responsável humano

O responsável humano:

- aprova decisões;
- executa comandos de alto impacto;
- executa validações pesadas quando orientado;
- executa migrations locais quando necessário;
- executa `commit`, `push`, abertura de PR, merge, deploy e rollback;
- decide quando um Gate pode ser iniciado ou encerrado.

### 3.2. Antigravity

O Antigravity é o agente principal de implementação.

Pode, dentro de escopo explícito:

- produzir código;
- refatorar código;
- corrigir bugs;
- criar ou ajustar testes;
- criar ou atualizar documentação local;
- realizar pequenas melhorias estruturais;
- preparar patches revisáveis;
- inspecionar arquivos necessários à tarefa.

Não pode decidir ou executar independentemente:

- arquitetura;
- contratos públicos;
- política de autenticação;
- segurança;
- modelo de dados;
- infraestrutura;
- deploy;
- release;
- rollback;
- custos;
- produto;
- billing;
- dados de produção.

### 3.3. Outros agentes

Qualquer outro agente que atue no repositório deve seguir as mesmas regras atribuídas ao Antigravity.

Nenhum agente recebe permissão implícita apenas por possuir acesso técnico a uma ferramenta.

## 4. Economia de execução e disciplina de tokens

Este é um projeto mantido por um desenvolvedor solo. O agente deve otimizar tempo, custo e contexto.

### 4.1. Regra principal

Não executar processos caros, demorados, ruidosos ou com grande volume de saída sem necessidade direta e aprovação.

Quando uma validação puder consumir muitos tokens ou gerar logs extensos, o agente deve:

1. explicar por que a validação é necessária;
2. fornecer o comando exato;
3. indicar o ambiente em que o comando deve ser executado;
4. informar o resultado esperado;
5. pedir apenas o trecho relevante do output.

### 4.2. Processos normalmente executados pelo humano

Por padrão, o agente deve orientar o humano a executar:

```text
npm ci
npm run build:nest
npm test completo
npm run db:migrate
npm start para validação manual
docker compose build
docker compose up
docker logs extensos
testes de integração amplos
smokes completos
scans de segurança
auditorias de dependências
comandos que percorrem o repositório inteiro
comandos que geram diffs ou logs muito grandes
qualquer comando remoto
```

O agente pode executar apenas verificações rápidas, locais, direcionadas e com output limitado quando isso for necessário para produzir um patch correto.

### 4.3. Inspeção eficiente

O agente deve:

- abrir somente os arquivos necessários;
- preferir buscas por símbolo, função, rota ou configuração;
- evitar despejar diretórios inteiros;
- evitar reler arquivos já conhecidos sem motivo;
- evitar repetir o mesmo teste;
- evitar executar a suíte completa durante cada microalteração;
- usar testes direcionados antes de testes amplos;
- resumir resultados em vez de reproduzir logs extensos.

### 4.4. Comunicação de comandos

Ao pedir execução humana, sempre informar:

```text
Ambiente
Diretório
Comando exato
Impacto esperado
Resultado esperado
Trecho do output que deve ser retornado
```

Preferir um comando ou uma microetapa por vez quando houver risco, decisão ou possibilidade de falha.

## 5. Ambiente local canônico

Ambiente local aprovado:

```text
Windows
WSL 2
Ubuntu 24.04 LTS
usuário Linux: hscuser
workspace: /home/hscuser/workspace
repositório: /home/hscuser/workspace/hsc-auth-api
Node.js: 22.22.0 via NVM no WSL
npm: 10.9.4 via NVM no WSL
Docker Desktop com integração WSL
```

Regras:

- trabalhar no filesystem Linux;
- não desenvolver o projeto em `/mnt/c`;
- não usar Node.js ou npm do Windows dentro do WSL;
- não usar caminhos de `nvm4w`;
- não instalar Docker Engine dentro do WSL quando o Docker Desktop já estiver integrado;
- não executar comandos contra produção por padrão.

## 6. Fluxo Git

Todo trabalho deve ocorrer em branch específica.

Antes de iniciar uma implementação:

```bash
git status --short --branch
git fetch origin --prune
git rev-parse HEAD origin/main
```

Regras:

- partir de `main` limpa;
- confirmar o SHA-base;
- não alterar arquivos não relacionados;
- não fazer `commit` automaticamente;
- não fazer `push` automaticamente;
- não abrir PR automaticamente;
- não fazer merge automaticamente;
- não criar tags;
- não executar `reset --hard`;
- não executar rebase;
- não executar force push;
- não apagar branches;
- não sobrescrever trabalho local.

Antes de o humano criar commit, o agente deve orientar:

```bash
git status --short
git diff --check
git diff --stat
```

O agente deve fornecer os comandos de `commit` e `push`, mas o humano os executa.

## 7. Escopo permitido

Dentro de uma tarefa explícita, o agente pode trabalhar em:

```text
NestJS controllers
NestJS modules
NestJS guards
NestJS services
NestJS repositories
request validation
response shaping
database access modules
configuração da aplicação
bootstrap da aplicação
SQL migrations para revisão local
testes unitários
testes de integração local
local smoke scripts
pequenas refatorações
correções de bugs
documentação em docs/**
README e AGENTS.md quando solicitado
```

O agente pode inspecionar:

```text
package.json
package-lock.json
index.js
src/**
db/migrations/**
scripts/**
docs/**
ops/*.sh apenas para entendimento
docker-compose.yml apenas para entendimento
```

## 8. Trabalho proibido sem aprovação explícita

Não executar ou modificar por padrão:

```text
deploy
release
rollback
produção
AWS Lightsail
SSH remoto
DNS
TLS
firewall
Nginx
systemd
banco de produção
migrations de produção
dados reais de produção
segredos
GitHub Actions
tags
chaves
credenciais
rotação de segredo
alteração de custo de infraestrutura
```

Não modificar sem pedido explícito:

```text
.github/workflows/**
ops/deploy-auth.sh
ops/release.sh
ops/deploy-local.sh
docker-compose.yml
```

A leitura desses arquivos é permitida quando necessária para entender o projeto.

## 9. Segurança e variáveis de ambiente

Arquivos `.env` são material secreto.

O agente não deve:

```text
ler .env sem instrução explícita
imprimir .env
copiar .env
resumir valores reais de .env
gerar exemplos a partir de .env real
commitar .env
renomear .env
apagar .env
expor tokens
expor cookies
expor chaves
expor senhas
expor hashes de sessão
expor credenciais de banco
```

Usar `.env.local.example` como referência segura de nomes.

### 9.1. Disciplina de configuração

A aplicação deve preferir configuração centralizada, validada e construída após o carregamento do ambiente.

Evitar:

- leituras dispersas de `process.env`;
- captura de configuração em constantes de nível superior antes do bootstrap;
- defaults silenciosos para configurações obrigatórias;
- logs com valores sensíveis;
- mensagens de erro que revelem segredos.

Variáveis fornecidas pelo processo devem prevalecer sobre arquivos de ambiente.

Falhas de configuração obrigatória devem interromper o startup com mensagem sanitizada e código de saída diferente de zero.

A configuração validada deve ser disponibilizada aos módulos NestJS por injeção de dependências.

Controllers, guards, services e repositories não devem carregar novamente arquivos `.env` nem criar fontes paralelas de configuração.

## 10. Fronteiras de autenticação

Admin Auth e Player Auth são conceitos separados.

Não reutilizar entre eles:

```text
cookies
guards
tabelas
sessões
RBAC
semântica de identidade
semântica de autorização
```

Cookies conhecidos:

```text
hsc_admin_session
hsc_player_session
```

Regras:

- não imprimir cookies;
- não imprimir tokens;
- não imprimir hashes;
- não registrar query strings sensíveis do callback Steam;
- não expor detalhes internos de armazenamento de sessão;
- não misturar guards, cookies ou sessões de Admin Auth e Player Auth.

Mudanças em autenticação, cookies, sessão, Steam identity ou RBAC exigem aprovação humana explícita.

## 11. Fronteira do Player Bunker

A Auth API é o gateway autenticado do Player Bunker.

Pode:

```text
autenticar o player
resolver SteamID64 autenticado
ler artefatos preparados
sanitizar payloads
retornar respostas defensivas
adicionar campos seguros quando a fonte for explícita
```

Não pode:

```text
recalcular ranking
recalcular score
recalcular prize eligibility
inferir participação em Season
mutar artefatos ETL
publicar artefatos ETL
ler MatchZy DB diretamente
consultar o servidor CS2 diretamente
criar nova fonte de verdade competitiva
```

O ETL é dono da materialização de estatísticas competitivas.

O Portal é dono da apresentação.

A Auth API é dona do acesso autenticado e da modelagem segura da resposta.

## 12. Fronteira de artefatos

Artefatos do Player Bunker são gerados pelo `hsc-cs2-etl` e lidos em modo somente leitura.

Variáveis relevantes:

```text
PLAYER_BUNKER_ARTIFACT_ROOT
PLAYER_BUNKER_ACTIVE_SEASON_SLUG
PLAYER_BUNKER_STATIC_API_BASE_URL
PLAYER_BUNKER_STATIC_API_TIMEOUT_MS
```

Layout esperado:

```text
<PLAYER_BUNKER_ARTIFACT_ROOT>/season/<slug>/players-manifest.json
<PLAYER_BUNKER_ARTIFACT_ROOT>/season/<slug>/player/<steamid64>.json
```

Regras:

- não escrever no artifact root;
- não apagar artefatos;
- não assumir que o diretório está dentro do repositório;
- não assumir que o diretório existe;
- validar path traversal;
- sanitizar payloads;
- usar fallback seguro para ausência, erro ou configuração incompleta;
- não expor caminhos locais em respostas públicas.

## 13. Contratos HTTP

Não alterar contratos HTTP existentes sem aprovação explícita.

Isso inclui:

```text
rotas
métodos
status codes
campos obrigatórios
response shape
cookies
sessões
autorização
fluxo magic link
fluxo Steam
Player Bunker
health
admin APIs
content APIs
```

Adições retrocompatíveis também devem ser destacadas para revisão.

Se uma implementação exigir decisão de contrato, o agente deve parar antes de alterar o código.

Controllers devem permanecer responsáveis pela tradução do transporte HTTP e não devem ocultar alterações contratuais dentro de services ou repositories.

## 14. Banco de dados e migrations

Mudanças de banco devem ser deliberadas e revisáveis.

Regras:

- criar migration nova e numerada;
- não editar migration já aplicada;
- não presumir acesso à produção;
- não executar migration de produção;
- não mudar semântica de identidade ou sessão sem aprovação;
- documentar a razão da migration;
- preservar compatibilidade quando possível;
- manter migrations separadas do startup da aplicação HTTP;
- não executar migrations automaticamente por lifecycle hook do NestJS;
- não habilitar `multipleStatements` nas conexões de runtime;
- não introduzir ORM sem decisão arquitetural explícita.

Validação de migration deve ocorrer apenas em ambiente local/dev e, por padrão, ser executada pelo humano:

```bash
ENV_FILE=.env.local npm run db:migrate
```

## 15. Dependências

Não adicionar, remover ou atualizar dependências sem aprovação explícita.

Não executar automaticamente:

```text
npm audit fix
npm audit fix --force
npm update
npm install <nova-dependencia>
npm install -g
alteração de major version
regeneração desnecessária de package-lock.json
```

Vulnerabilidades encontradas devem ser registradas separadamente, sem misturar sua correção com uma tarefa não relacionada.

## 16. Docker e banco local

Antes de usar Docker:

1. inspecionar `docker-compose.yml`;
2. confirmar portas, volumes e variáveis;
3. confirmar que todos os destinos são locais;
4. explicar o plano;
5. fornecer o comando ao humano.

Não subir containers automaticamente quando a tarefa puder ser resolvida por inspeção estática.

Não conectar containers locais a produção.

## 17. Estratégia de validação

A validação deve ser proporcional à mudança.

Ordem preferencial:

1. inspeção estática direcionada;
2. build TypeScript, quando a alteração afetar código NestJS;
3. teste unitário direcionado;
4. teste de integração local direcionado;
5. smoke local relevante;
6. suíte completa, apenas quando necessária;
7. validação manual da aplicação, apenas quando necessária.

Não executar repetidamente build, suíte completa, servidor ou smoke durante a implementação.

Quando um build ou teste falhar:

- não repetir automaticamente;
- identificar a causa;
- realizar uma correção determinística;
- executar novamente apenas a validação necessária;
- parar e relatar quando a causa não estiver clara.

Exemplos de comandos que podem ser fornecidos ao humano:

```bash
npm run build:nest
node --test caminho/do/teste.test.js
npm test
ENV_FILE=.env.local npm run db:migrate
ENV_FILE=.env.local npm start
ops/smoke-local.sh
ops/smoke-baseline.sh
```

Não usar scripts de deploy ou release como validação.

Não executar smoke de produção sem aprovação explícita.

## 18. Documentação

Documentação local vive em:

```text
docs/**
```

Documentação canônica do ecossistema pode existir em `hsc-docs`, mas não deve ser presumida como disponível.

Ao alterar comportamento:

- atualizar documentação local relevante;
- documentar configuração por nomes, nunca por valores reais;
- não transformar documentação em log de implementação;
- manter documentação orientada ao comportamento atual;
- evitar duplicação desnecessária;
- manter README, AGENTS e documentos operacionais alinhados ao runtime atual;
- registrar decisões arquiteturais em ADR, não no README.

## 19. Estilo de implementação

Preferir:

- mudanças pequenas;
- diffs focados;
- funções explícitas;
- controllers finos;
- services responsáveis por regras de aplicação;
- repositories responsáveis por persistência;
- módulos com fronteiras claras;
- injeção de dependências explícita;
- validação centralizada;
- nomes claros;
- compatibilidade retroativa;
- erros sanitizados;
- testes direcionados;
- documentação curta e precisa.

Evitar:

- grandes reescritas;
- abstração prematura;
- alteração incidental;
- dependências novas;
- formatação massiva;
- renomeações sem necessidade;
- mistura de múltiplos objetivos no mesmo diff;
- mudanças de contrato escondidas;
- services que dependam diretamente de objetos HTTP;
- repositories que decidam status codes ou response shapes;
- módulos globais sem necessidade;
- service locator;
- fontes paralelas de configuração;
- acesso disperso a `process.env`.

## 20. Relatório obrigatório do agente

Ao concluir uma microetapa de implementação, informar de forma objetiva:

```text
arquivos lidos
arquivos alterados
o que mudou
decisões tomadas
decisões pendentes
comandos executados pelo agente
comandos que o humano deve executar
resultado esperado
warnings ou riscos
git status --short
git diff --stat
```

Não despejar logs extensos nem reproduzir arquivos completos quando um resumo for suficiente.

## 21. Gates e pontos de parada

Cada Gate deve ter:

```text
escopo
pré-condições
critérios de aceite
validação
ponto de aprovação
```

Não iniciar o próximo Gate automaticamente.

O agente deve parar e pedir decisão humana quando a tarefa envolver:

```text
arquitetura
contrato público
auth
security policy
RBAC
cookies
sessões
Steam identity
database schema tradeoff
billing
subscriptions
entitlements
produção
infraestrutura
deploy
release
rollback
segredos
dados reais
terceiros
custos
mudança de escopo
```

## 22. Regra final

O objetivo do agente é produzir uma mudança correta, pequena, revisável e economicamente eficiente.

Velocidade não justifica:

- gastar contexto desnecessariamente;
- executar processos pesados sem necessidade;
- tomar decisões não autorizadas;
- misturar escopos;
- alterar produção;
- expor segredos;
- quebrar contratos.