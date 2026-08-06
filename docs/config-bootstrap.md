# HSC Auth API — Configuration & Bootstrap Architecture

Este documento descreve a arquitetura de inicializacao (bootstrap) e o ciclo de validacao de configuracao do `hsc-auth-api`.

## Fluxo de Startup

O ponto de entrada da aplicacao (`index.js`) utiliza um fluxo de bootstrap em duas etapas para garantir a correta avaliacao das variaveis de ambiente no runtime ES Modules (ESM):

1. **`index.js` (Entrypoint minimalista):** Possui apenas o import estatico do orquestrador `runBootstrap()`. Nao importa a arvore da aplicacao Express, banco de dados ou servicos antes do carregamento do ambiente.
2. **`runBootstrap()`:**
   - Chama `loadEnv()`, que carrega o arquivo de ambiente apontado por `ENV_FILE` (ou `.env` por padrao).
   - Constroi e valida o objeto central de configuracao imutavel via `buildAppConfig(process.env)`.
   - Realiza o **import dinamico** da aplicacao (`import("../app/startApplication.js")`) estritamente apos a configuracao estar validada.
   - Invoca `startApplication(config)` repassando a configuracao injetada.

## Precedencia de Configuracao

A resolucao de variaveis obedece a seguinte ordem estrita de precedencia:

```text
Variavel ja presente no processo (process.env)
  > Arquivo de ambiente (ENV_FILE ou .env)
    > Default permitido da aplicacao
```

## Validacao e Sanitizacao de Erros

A aplicacao realiza validacao previa de tipo e formato para todas as variaveis no bootstrap via `buildAppConfig`:

- **Portas:** Inteiro valido no intervalo `1–65535` (`PORT`, `DB_PORT`, `SMTP_PORT`).
- **TTLs:** Inteiros positivos (`ADMIN_SESSION_TTL_HOURS`, `MAGIC_LINK_TTL_MINUTES`, `PLAYER_SESSION_TTL_HOURS`).
- **Timeouts:** Inteiros positivos (`PLAYER_BUNKER_STATIC_API_TIMEOUT_MS`).
- **Booleanos:** Declaracao explicita case-insensitive (`"true"` ou `"false"`).
- **URLs Absolutas:** Esquema obrigatorio `http:` ou `https:` (`AUTH_API_PUBLIC_URL`, `BACKOFFICE_URL`, `PLAYER_STEAM_RETURN_URL`, `PLAYER_STEAM_REALM`, `PLAYER_BUNKER_STATIC_API_BASE_URL`).
- **Paths HTTP:** String iniciada obrigatoriamente por `/` (`MAGIC_LINK_CALLBACK_PATH`).
- **Redirects:** Caminho relativo iniciado por `/` ou URL absoluta `http`/`https` (`PLAYER_AUTH_SUCCESS_REDIRECT_URL`, `PLAYER_AUTH_FAILURE_REDIRECT_URL`).

### Tratamento de Falha Sanitizada

Se qualquer configuracao obrigatoria for invalida:
- O processo e interrompido com `exitCode = 1` sem executar a aplicacao Express.
- O erro do tipo `ConfigError` e registrado em `stderr` com o prefixo `[bootstrap-config]`, contendo apenas a chave da variavel e o motivo da falha.
- Nenhum valor sensivel, segredo, senha ou stack trace e exposto nos logs.

## Supressao de Logs do Dotenv (`quiet: true`)

O carregador de ambiente utiliza `dotenv.config({ quiet: true })`. Esta opcao suprime exclusivamente as mensagens informativas e dicas emitidas pelo dotenv em `stdout`/`stderr`, sem ocultar erros proprios da aplicacao.

## Player Bunker (Defensivo e Opcional)

As configuracoes do Player Bunker (`PLAYER_BUNKER_ARTIFACT_ROOT`, `PLAYER_BUNKER_ACTIVE_SEASON_SLUG`, `PLAYER_BUNKER_STATIC_API_BASE_URL`) permanecem totalmente opcionais. A ausencia dessas variaveis nao interrompe o startup e ativa os fallbacks defensivos da aplicacao.
