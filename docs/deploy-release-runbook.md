# HSC Auth API — Release & Lightsail Deploy Runbook

## Objetivo

Este documento descreve o fluxo operacional atual para:

```text
main
→ validação local
→ tag de release
→ deploy no AWS Lightsail
→ migrations
→ restart systemd
→ smoke pós-deploy
→ rollback, se necessário
→ GitHub Release
```

Ele substitui os antigos fluxos baseados em:

```text
ops/smoke-local.sh
ops/deploy-local.sh
smoke administrativo com ADMIN_KEY
workflow develop → main
```

A documentação histórica continua disponível pelo Git.

---

## 1. Componentes oficiais

### Desenvolvimento/local

```text
ops/dev.sh
npm run smoke:local
```

`npm run smoke:local` é o smoke local canônico.

Ele:

- compila o NestJS;
- sobe uma aplicação efêmera;
- utiliza banco local;
- valida contratos e fronteiras de segurança;
- encerra a aplicação ao concluir.

Referência:

```text
docs/local-smoke.md
```

### Runtime local persistente

```text
ops/dev.sh
```

Uso:

```bash
./ops/dev.sh
```

Responsabilidades:

- executar somente fora de `/opt/hsc`;
- subir as dependências Docker Compose locais;
- aguardar o MariaDB;
- executar `npm ci` somente quando `node_modules` estiver ausente;
- compilar o runtime NestJS;
- iniciar a aplicação em foreground usando `ENV_FILE`.

O script não faz `source` direto do arquivo `.env`.

O carregamento de configuração continua responsabilidade do bootstrap da aplicação.

`Ctrl+C` encerra o processo Node em foreground, mas não derruba automaticamente as dependências Docker.

### Diagnóstico

```text
ops/status.sh
```

Uso:

```bash
./ops/status.sh
```

É um comando read-only de diagnóstico.

Exibe, quando disponíveis:

```text
Node/npm
Git branch/commit/tag/dirty state
Docker Compose deste projeto
estado do serviço systemd
GET /health
```

Ele não lê `.env`, não imprime secrets e não altera o ambiente.

No Git, `tag` é exibida somente quando o `HEAD` corresponde exatamente a uma tag.

### Encerramento das dependências locais

```text
ops/stop.sh
```

Uso padrão:

```bash
./ops/stop.sh
```

Equivale ao encerramento das dependências Docker Compose locais com remoção de órfãos.

Opções destrutivas adicionais são explícitas:

```bash
./ops/stop.sh --volumes
./ops/stop.sh --images
./ops/stop.sh --volumes --images
```

O script:

- possui guardrail contra `/opt/hsc`;
- não mata processos Node;
- não utiliza `kill`, `pkill`, `fuser` ou mecanismos equivalentes;
- atua somente sobre o Docker Compose deste projeto.

Use `--volumes` e `--images` apenas quando a remoção correspondente for realmente desejada.

### Release

```text
ops/release.sh
```

É executado somente na workstation local.

Responsabilidades:

- exigir branch `main`;
- exigir working tree limpa;
- exigir `main == origin/main`;
- impedir reutilização de tag existente;
- validar ambiente local;
- executar migrations locais;
- executar `npm run smoke:local`;
- criar tag Git anotada;
- enviar a tag ao GitHub.

A tag é o artefato implantável.

### Deploy de produção

```text
ops/deploy-auth.sh
```

É executado no AWS Lightsail como:

```text
hscadmin
```

Host de produção atual:

```text
ip-172-26-13-181
```

O guard do script usa:

```text
DEPLOY_EXPECTED_HOST
```

com `ip-172-26-13-181` como default. O override existe apenas para mudança
operacional explícita de host; não deve ser usado para contornar um mismatch
não investigado.

Diretório esperado:

```text
/opt/hsc/hsc-auth-api
```

Serviço systemd:

```text
hsc-auth-api
```

Responsabilidades:

- validar host;
- impedir deploy concorrente;
- buscar tags;
- registrar tag anterior para rollback;
- fazer checkout da tag;
- instalar dependências;
- compilar NestJS quando suportado pela tag;
- remover dependências de desenvolvimento;
- executar migrations;
- reiniciar systemd;
- executar smoke pós-deploy;
- exibir logs do serviço quando o smoke falhar.

### Smoke pós-deploy

```text
npm run smoke:deploy
```

Implementação:

```text
scripts/smoke-deploy.js
```

Esse smoke não inicia a aplicação e não lê `.env`.

Ele valida uma instância já em execução.

---

## 2. Diferença entre os smokes

### `smoke:local`

```text
npm run smoke:local
```

Uso:

```text
desenvolvimento
validação antes de release
```

Características:

- aplicação efêmera;
- DB obrigatoriamente local;
- pode sobrescrever configuração apenas em memória;
- não é apropriado para produção.

### `smoke:deploy`

```text
npm run smoke:deploy
```

Uso:

```text
aplicação já iniciada
pós-deploy
produção/Lightsail
```

Características:

- não sobe processo;
- não executa migrations;
- não lê secrets;
- aceita apenas target loopback;
- não cria conta;
- não cria sessão;
- não envia e-mail;
- não cria membership;
- não altera artifact;
- não exige ADMIN_KEY.

Cobertura atual:

```text
GET /health
GET /content/news
GET /content/seasons
GET /content/seasons/active

GET /player/account
GET /player/profile/me
GET /player/membership
GET /player/bunker/summary

GET /admin/player-accounts

POST /internal/server-access/authorize
```

O smoke confirma:

- aplicação viva;
- banco ready;
- conteúdo público disponível;
- player routes protegidas;
- admin routes protegidas;
- Server Access configurado e rejeitando credencial inválida.

---

## 3. Server Access no smoke de produção

O smoke não conhece:

```text
SERVER_ACCESS_INTERNAL_API_KEY
```

Ele envia uma chave aleatória deliberadamente inválida.

Resultado esperado quando Server Access está configurado:

```text
401 invalid_internal_key
```

Se o runtime responder:

```text
503 internal_api_key_not_configured
```

o smoke falha.

Isso é intencional.

Um deploy não deve ser considerado saudável se o contrato de Server Access existir no runtime mas sua credencial obrigatória estiver ausente.

---

## 4. Compatibilidade com rollback

Tags anteriores à introdução de:

```text
npm run smoke:deploy
```

não possuem o smoke moderno.

`ops/deploy-auth.sh` detecta essa condição.

Para tags antigas ele utiliza fallback mínimo e read-only:

```text
GET /health
GET /content/news
GET /content/seasons
GET /content/seasons/active
```

O fallback não utiliza `ADMIN_KEY`.

Essa compatibilidade existe somente para permitir rollback de tags históricas.

Novas releases devem possuir `smoke:deploy`.

---

## 5. Preparação de uma release

Antes de criar tag:

```bash
git switch main
git pull --ff-only origin main
git status --short --branch
```

Pré-condições:

```text
branch = main
working tree = clean
HEAD = origin/main
schema local atualizado
npm test = PASS
npm run smoke:local = PASS
```

O script de release valida novamente os pontos essenciais.

Execução:

```bash
./ops/release.sh vX.Y.Z
```

Não executar o script apenas para "testar".

Ele cria e envia uma tag real.

---

## 6. Tag versus GitHub Release

São objetos diferentes.

### Tag

```text
vX.Y.Z
```

É necessária antes do deploy.

Representa exatamente o commit implantado.

### GitHub Release

É criada depois que a tag:

- existe;
- foi implantada;
- passou pelo smoke de produção.

Fluxo recomendado:

```text
tag
→ deploy
→ smoke de produção
→ GitHub Release
```

A GitHub Release documenta a versão que foi efetivamente publicada.

---

## 7. Pré-flight do Lightsail

Antes de qualquer deploy real, validar sem imprimir valores secretos:

```text
host correto
repo existente
systemd ativo
tag atual
Node/npm
permissões
.env existente
nomes de configuração necessários
estado das migrations
espaço em disco
rollback state
```

Nunca imprimir valores reais de `.env`.

### Configuração nova relevante

O runtime atual conhece, entre outras:

```text
SERVER_ACCESS_INTERNAL_API_KEY

SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS

PLAYER_EMAIL_AUTH_ENABLED
PLAYER_EMAIL_VERIFICATION_TTL_MINUTES
PLAYER_EMAIL_VERIFICATION_URL
PLAYER_EMAIL_FROM
PLAYER_EMAIL_VERIFICATION_SUBJECT
PLAYER_EMAIL_PASSWORD_RESET_TTL_MINUTES
PLAYER_EMAIL_PASSWORD_RESET_URL
PLAYER_EMAIL_PASSWORD_RESET_SUBJECT
PLAYER_EMAIL_LINK_TTL_MINUTES
PLAYER_EMAIL_LINK_URL
PLAYER_EMAIL_LINK_SUBJECT

PLAYER_STEAM_LINK_TTL_MINUTES
PLAYER_STEAM_LINK_RETURN_URL
```

Se:

```text
PLAYER_EMAIL_AUTH_ENABLED=true
```

a configuração SMTP exigida pelo runtime deve estar válida.

Server Access precisa de:

```text
SERVER_ACCESS_INTERNAL_API_KEY
```

para que o novo smoke pós-deploy passe.

---

## 8. Migrations

O deploy executa:

```bash
ENV_FILE=.env npm run db:migrate
```

antes do restart do serviço.

Portanto migrations pendentes fazem parte do deploy da tag.

No ciclo atual, as migrations player ainda não aplicadas em produção precisam ser tratadas explicitamente no gate de produção:

```text
0012_player_email_auth.sql
0013_player_email_password_reset.sql
0014_player_identity_linking.sql
0015_player_profiles.sql
0016_player_memberships.sql
```

Aplicar migrations localmente não significa que elas foram aplicadas em produção.

Antes do deploy:

- verificar migrations já aplicadas;
- confirmar as pendentes;
- revisar compatibilidade;
- confirmar backup/readiness;
- obter aprovação explícita.

---

## 9. Deploy no Lightsail

Deploy normal:

```bash
sudo -u hscadmin -H \
  /opt/hsc/hsc-auth-api/ops/deploy-auth.sh vX.Y.Z
```

Também existe GitHub Actions manual:

```text
.github/workflows/deploy.yml
```

O workflow:

- recebe uma tag;
- verifica se pertence ao histórico de `main`;
- conecta por SSH ao Lightsail;
- busca explicitamente a tag alvo no repositório do servidor;
- extrai `ops/deploy-auth.sh` diretamente da própria tag para um arquivo temporário;
- executa essa cópia temporária como `hscadmin`.

O deploy normal não deve iniciar chamando diretamente o
`ops/deploy-auth.sh` que já estava instalado no checkout anterior.

Essa regra evita o problema de bootstrap em que a primeira implantação de uma
nova versão seria governada pelo script operacional da versão antiga.

O arquivo temporário também impede que o checkout da tag substitua o script que
está executando o próprio deploy.

Para rollback, o workflow copia primeiro o script atualmente instalado para
`/tmp` e executa a cópia, evitando o mesmo risco de auto-substituição.

---

## 10. Ordem do deploy

Para tags atuais:

```text
git fetch tags
→ checkout da tag
→ npm ci
→ npm run build:nest
→ npm prune --omit=dev
→ npm run db:migrate
→ systemctl restart hsc-auth-api
→ npm run smoke:deploy
```

O smoke ocorre somente depois do restart.

---

## 11. Rollback

Comando:

```bash
sudo -u hscadmin -H \
  /opt/hsc/hsc-auth-api/ops/deploy-auth.sh --rollback
```

O script utiliza:

```text
/opt/hsc/.deploy-auth-last-tag
```

para identificar a tag anterior.

Importante:

```text
rollback de código ≠ rollback automático de migration
```

O deploy não desfaz migrations já aplicadas.

Por isso migrations devem permanecer compatíveis com rollback de aplicação sempre que possível.

Caso uma migration exija rollback destrutivo ou manual, isso deve ser planejado antes do deploy.

---

## 12. Logs

Log operacional do deploy:

```text
/var/log/hsc/deploy-auth.log
```

Logs do serviço:

```bash
sudo journalctl \
  -u hsc-auth-api \
  -n 80 \
  --no-pager
```

Nunca copiar secrets ou conteúdo integral de `.env` para logs de diagnóstico.

---

## 13. Gate de produção

Nenhum destes atos é implícito:

```text
criar tag
aplicar migration em produção
executar deploy
executar rollback
alterar .env
alterar systemd
criar GitHub Release
```

Cada operação de produção deve ocorrer apenas no passo explicitamente aprovado.

---

## 14. Fluxo oficial resumido

```text
feature/fix/chore branch
→ PR
→ main
→ testes completos
→ smoke local
→ release tag
→ pré-flight Lightsail
→ aprovação
→ deploy tag
→ migrations
→ restart
→ smoke:deploy
→ validação externa
→ GitHub Release
→ fechamento da versão
```
