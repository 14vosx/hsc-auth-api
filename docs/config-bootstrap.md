# HSC Auth API — Configuration & Bootstrap Architecture

Este documento descreve o fluxo atual de carregamento, validação e injeção de configuração do `hsc-auth-api`.

A aplicação utiliza NestJS 11 com TypeScript em modo estrito. A configuração é carregada e validada antes da criação do runtime HTTP.

## Objetivos

O bootstrap deve garantir que:

- o ambiente seja carregado antes da árvore da aplicação;
- a configuração seja construída em um único ponto;
- valores inválidos interrompam o startup;
- erros sejam registrados de forma sanitizada;
- módulos NestJS recebam configuração por injeção de dependências;
- não existam fontes paralelas de configuração;
- migrations permaneçam separadas do runtime HTTP.

## Arquivos principais

```text
index.js
src/bootstrap/runBootstrap.js
src/config/env.js
src/config/appConfig.js
src/config/helpers.js
src/nest/core/app-config.ts
src/nest/core/core-config.module.ts
src/nest/app.module.ts
src/nest/startApplication.ts
dist/nest/startApplication.js
```

Responsabilidades:

- `index.js`: entrypoint minimalista;
- `src/bootstrap/runBootstrap.js`: orquestra carregamento, validação e inicialização;
- `src/config/env.js`: carrega o arquivo de ambiente;
- `src/config/appConfig.js`: constrói a configuração central;
- `src/config/helpers.js`: contém parsers e erros de validação;
- `src/nest/core/app-config.ts`: define o contrato TypeScript da configuração;
- `src/nest/core/core-config.module.ts`: registra `APP_CONFIG` no container NestJS;
- `src/nest/app.module.ts`: compõe os módulos da aplicação;
- `src/nest/startApplication.ts`: cria e inicia o runtime NestJS;
- `dist/nest/startApplication.js`: saída compilada utilizada pelo processo.

## Fluxo de startup

```text
node index.js
  └── runBootstrap()
        ├── loadEnv()
        ├── buildAppConfig(process.env)
        ├── import("../../dist/nest/startApplication.js")
        ├── startApplication(config)
        ├── NestFactory.create(AppModule.forRoot(config))
        └── app.listen(config.runtime.port)
```

A ordem obrigatória é:

```text
carregar ambiente
→ validar configuração
→ importar aplicação compilada
→ criar aplicação NestJS
→ iniciar listener HTTP
```

## Entrypoint

O `index.js` deve permanecer minimalista.

Ele não deve importar antecipadamente:

- módulos NestJS;
- controllers;
- services;
- repositories;
- conexão de banco;
- integrações Steam;
- infraestrutura de uploads.

Isso evita que a árvore da aplicação seja avaliada antes do carregamento e da validação do ambiente.

## Carregamento do ambiente

`runBootstrap()` chama `loadEnv()`.

O carregador utiliza:

```js
dotenv.config({
  path: process.env.ENV_FILE || ".env",
  quiet: true,
});
```

O arquivo é definido por:

```text
ENV_FILE
```

Quando `ENV_FILE` não está definido, o caminho padrão é:

```text
.env
```

Exemplo local:

```bash
ENV_FILE=.env.local npm start
```

Arquivos `.env` são secretos e não devem ser:

- commitados;
- impressos;
- copiados para documentação;
- utilizados como fonte de exemplos;
- incluídos em logs;
- enviados em issues ou pull requests.

A referência segura de nomes é:

```text
.env.local.example
```

## Precedência

A precedência de configuração é:

```text
variável já presente no processo
  > valor carregado pelo arquivo ENV_FILE
    > default permitido pela aplicação
```

O `dotenv` não deve sobrescrever uma variável já definida no processo.

Exemplo:

```bash
PORT=3101 ENV_FILE=.env.local npm start
```

Nesse caso, `PORT=3101` tem precedência sobre o valor existente em `.env.local`.

## Construção da configuração

Após o carregamento do ambiente, o bootstrap executa:

```js
buildAppConfig(process.env)
```

O resultado é a fonte central de configuração da aplicação.

Categorias atuais:

```text
runtime
adminAuth
playerAuth
playerSteamAuth
playerBunker
cors
db
steamProfiles
uploads
```

Estrutura conceitual:

```text
AppConfig
├── runtime
├── adminAuth
├── playerAuth
├── playerSteamAuth
├── playerBunker
├── cors
├── db
├── steamProfiles
└── uploads
```

O objeto retornado é protegido em nível superior com:

```js
Object.freeze(...)
```

O congelamento atual não é deep freeze.

## Regras de configuração

A configuração deve ser construída exclusivamente pelos módulos em:

```text
src/config/
```

Regras:

- não carregar novamente arquivos `.env` dentro do NestJS;
- não usar `dotenv.config()` em controllers, guards, services ou repositories;
- não espalhar leituras diretas de `process.env`;
- não criar um segundo objeto global de configuração;
- não duplicar parsers ou validações;
- não adicionar defaults silenciosos para valores obrigatórios;
- não registrar segredos, credenciais ou valores sensíveis;
- não documentar valores reais de ambiente.

## Import da aplicação compilada

Somente após a validação bem-sucedida, o bootstrap executa:

```js
import("../../dist/nest/startApplication.js")
```

O runtime não importa diretamente arquivos TypeScript.

A aplicação utiliza a saída compilada em:

```text
dist/nest/
```

## Build

Antes do startup em um checkout limpo:

```bash
npm run build:nest
```

O build utiliza:

```text
tsconfig.nest.json
```

A saída é gerada em:

```text
dist/nest/
```

O diretório `dist/`:

- é artefato de build;
- não é fonte de código;
- não deve ser editado manualmente;
- não substitui os arquivos em `src/nest/`.

## Injeção no NestJS

O objeto validado é registrado pelo:

```text
CoreConfigModule
```

O token utilizado é:

```text
APP_CONFIG
```

Estrutura conceitual:

```ts
{
  provide: APP_CONFIG,
  useValue: config,
}
```

O `CoreConfigModule` exporta esse provider para os demais módulos.

Consumidores devem receber configuração por injeção:

```ts
constructor(
  @Inject(APP_CONFIG)
  private readonly config: AppConfig,
) {}
```

Controllers, guards, services e repositories não devem reconstruir a configuração.

## Composição da aplicação

A aplicação é criada por:

```text
AppModule.forRoot(config)
```

O objeto validado é fornecido antes da inicialização dos módulos.

O runtime é criado por:

```ts
NestFactory.create<NestExpressApplication>(
  AppModule.forRoot(config),
)
```

O adaptador HTTP é:

```text
@nestjs/platform-express
```

O Express é utilizado somente como adaptador interno do NestJS.

A aplicação possui:

```text
um processo Node.js
um listener HTTP
um pipeline HTTP
um composition root NestJS
```

Não devem ser introduzidos:

- segundo servidor HTTP;
- segundo listener;
- aplicação Express independente;
- fallback entre frameworks;
- divisão de rotas;
- pipelines HTTP concorrentes.

## Porta e listener

A porta é obtida de:

```text
config.runtime.port
```

A aplicação escuta em:

```text
0.0.0.0
```

Inicialização:

```ts
await app.listen(config.runtime.port, "0.0.0.0");
```

Variável relacionada:

```text
PORT
```

O valor deve ser um inteiro válido no intervalo permitido para portas TCP.

Exemplo:

```bash
PORT=3101 ENV_FILE=.env.local npm start
```

## Validação

A configuração é validada antes da criação da aplicação NestJS.

### Portas

Devem ser inteiros válidos no intervalo:

```text
1–65535
```

Exemplos:

```text
PORT
DB_PORT
SMTP_PORT
```

### TTLs

Devem ser valores numéricos válidos e positivos quando exigidos.

Exemplos:

```text
ADMIN_SESSION_TTL_HOURS
MAGIC_LINK_TTL_MINUTES
PLAYER_SESSION_TTL_HOURS
```

### Timeouts

Devem ser valores válidos e positivos.

Exemplo:

```text
PLAYER_BUNKER_STATIC_API_TIMEOUT_MS
```

### Booleanos

Devem usar representação explícita aceita pelo parser:

```text
true
false
```

Valores ambíguos não devem ser interpretados silenciosamente.

### URLs absolutas

Devem utilizar:

```text
http:
https:
```

Exemplos:

```text
AUTH_API_PUBLIC_URL
BACKOFFICE_URL
PLAYER_STEAM_RETURN_URL
PLAYER_STEAM_REALM
PLAYER_BUNKER_STATIC_API_BASE_URL
```

### Paths HTTP

Devem iniciar com:

```text
/
```

Exemplo:

```text
MAGIC_LINK_CALLBACK_PATH
```

### Redirects

Podem aceitar, conforme o campo:

- path relativo iniciado por `/`;
- URL absoluta `http` ou `https`.

Exemplos:

```text
PLAYER_AUTH_SUCCESS_REDIRECT_URL
PLAYER_AUTH_FAILURE_REDIRECT_URL
```

## Falhas de configuração

Erros de validação utilizam:

```text
ConfigError
```

Quando um `ConfigError` é capturado:

- a aplicação NestJS não é iniciada;
- o erro é registrado em `stderr`;
- o prefixo é `[bootstrap-config]`;
- o processo recebe `exitCode = 1`;
- valores sensíveis não são incluídos;
- stack traces não são expostos.

Formato:

```text
[bootstrap-config] <mensagem sanitizada>
```

Para falhas não classificadas como `ConfigError`:

```text
[bootstrap] application startup failed
```

Também nesse caso:

```text
process.exitCode = 1
```

Não devem ser expostos:

- conteúdo de `.env`;
- credenciais;
- senhas;
- tokens;
- cookies;
- SQL;
- stack traces;
- URLs com parâmetros sensíveis.

## Supressão de logs do dotenv

O carregador utiliza:

```text
quiet: true
```

Essa opção suprime mensagens informativas do `dotenv`.

Ela não deve:

- ocultar erros da aplicação;
- substituir os logs sanitizados do bootstrap;
- permitir startup com configuração inválida.

## Banco de dados

A configuração do banco é construída antes da inicialização do NestJS.

As conexões HTTP de runtime não devem habilitar:

```text
multipleStatements: true
```

O runtime pode verificar readiness, mas não deve alterar o schema.

A aplicação HTTP não deve:

- criar tabelas no startup;
- executar migrations no startup;
- aplicar DDL por lifecycle hook;
- editar migrations já aplicadas.

## Migrations

Migrations são executadas por uma operação CLI separada:

```bash
ENV_FILE=.env.local npm run db:migrate
```

Arquivos principais:

```text
db/migrations/
scripts/migrate.js
scripts/migrationRunner.js
```

As migrations:

- não pertencem ao bootstrap HTTP;
- não são chamadas por `startApplication()`;
- não são chamadas pelo `AppModule`;
- não são chamadas pelo `DatabaseModule`;
- devem seguir `docs/db-migrations-policy.md`.

## Inicialização local

Preparação:

```bash
npm ci
cp .env.local.example .env.local
```

Banco:

```bash
ENV_FILE=.env.local npm run db:migrate
```

Build:

```bash
npm run build:nest
```

Startup:

```bash
ENV_FILE=.env.local npm start
```

Startup com porta explícita:

```bash
PORT=3101 ENV_FILE=.env.local npm start
```

## Regras para novos módulos

Um novo módulo deve:

- receber configuração por `APP_CONFIG`;
- não carregar `.env`;
- não acessar `process.env` diretamente sem decisão explícita;
- não criar sistema próprio de configuração;
- validar novas variáveis no construtor central adequado;
- não registrar valores sensíveis;
- não executar migrations;
- não alterar contratos HTTP incidentalmente.

Quando uma nova variável for necessária:

1. adicionar o nome em `.env.local.example`;
2. implementar parsing e validação em `src/config/`;
3. incluir o campo no grupo correto de `AppConfig`;
4. tipar o campo em `src/nest/core/app-config.ts`;
5. consumir o valor por injeção de `APP_CONFIG`;
6. documentar somente nome e finalidade;
7. não registrar valores reais.

## Validação de alterações

Para mudanças em código NestJS ou bootstrap:

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

Build, testes, migrations, servidor e smokes devem ser executados somente quando relevantes.

Scripts de deploy ou release não devem ser usados como validação local.

## Referências

- `README.md`
- `AGENTS.md`
- `.env.local.example`
- `docs/db-migrations-policy.md`
- `docs/adr/0001-nestjs-modular-monolith-and-atomic-cutover.md`
- `docs/adr/0002-direct-nestjs-replacement.md`