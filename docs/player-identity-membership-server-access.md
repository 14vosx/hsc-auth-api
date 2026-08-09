# HSC Auth API — Player Identity, Profile, Membership & Server Access

## Objetivo

Este documento descreve o modelo player-facing atual do `hsc-auth-api`.

Ele consolida o estado vigente de:

- Player Auth;
- conta HSC;
- identidades de autenticação;
- Steam identity;
- profile;
- membership;
- administração de player accounts;
- administração de memberships;
- autorização interna de Server Access;
- invariantes de segurança associados.

Este documento descreve comportamento atual. Não é plano de implementação nem checkpoint histórico.

## Modelo de domínio

Invariante principal:

```text
Account ≠ auth method ≠ profile ≠ membership
```

### Account

`player_accounts` representa a conta HSC player-facing.

Estados atuais:

```text
active
disabled
```

Uma conta ativa pode existir sem Steam vinculada.

Uma conta desabilitada não deve continuar autenticando por sessões previamente emitidas.

### Auth methods

Métodos de autenticação e identidade são capacidades vinculadas à conta.

Atualmente o domínio suporta:

```text
e-mail
Steam OpenID
```

A existência de um método de autenticação não determina membership.

### Steam identity

SteamID64 não pode ser informado manualmente como identidade verificada.

A posse da identidade Steam deve ser provada por Steam OpenID.

Fluxos suportados incluem:

```text
login Steam
link Steam para conta existente
```

A identidade Steam é necessária para capacidades dependentes de CS2.

### Profile

Profile é a representação player-facing editável da conta.

Profile não é método de autenticação e não determina membership.

### Membership

Membership representa o vínculo de membro HSC.

Membership não deve ser inferido de:

- login;
- e-mail verificado;
- Steam vinculada;
- existência de profile;
- existência de stats;
- participação em Season.

## Player Auth

### Sessão

Cookie player-facing:

```text
hsc_player_session
```

Regras:

- `HttpOnly`;
- `Secure` em HTTPS;
- persistência somente de hash do token;
- token bruto não é persistido;
- sessão revogada ou expirada não autentica;
- conta `disabled` invalida autenticação por sessão.

TTL configurado por:

```text
PLAYER_SESSION_TTL_HOURS
```

### E-mail

Base das rotas:

```text
/player/auth/email
```

Capacidades implementadas:

- registration;
- email verification;
- login;
- password reset request;
- password reset confirm;
- email linking para conta autenticada.

Registration utiliza resposta genérica quando apropriado para reduzir enumeração de conta.

Login bem-sucedido emite `hsc_player_session`.

Configuração relacionada:

```text
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
```

Segredos e credenciais SMTP não devem ser documentados por valor.

### Steam OpenID

Rotas player-facing incluem:

```text
GET /player/auth/steam/start
GET /player/auth/steam/callback
```

Também existem fluxos autenticados de linking Steam.

O login normal utiliza state criptográfico browser-bound:

```text
hsc_player_steam_login_state
```

O callback deve corresponder ao state emitido para o navegador que iniciou o fluxo.

O state:

- é temporário;
- é aleatório;
- é validado com comparação timing-safe;
- não substitui a verificação OpenID;
- é removido após sucesso ou falha.

## Account summary

Contrato:

```text
GET /player/account
```

Proteção:

```text
PlayerAuthGuard
```

O endpoint retorna o estado atual da conta e capacidades de identidade.

A resposta pode indicar, entre outras condições:

```text
Steam linked
e-mail linked
e-mail verified
CS2 identity ready
personalized stats available
steam_link_required
```

Server Access não deve ser inferido dessa resposta.

## Profile

### Profile próprio

Contratos:

```text
GET   /player/profile/me
PATCH /player/profile/me
```

Leitura e mutação exigem sessão player válida.

Mutação também preserva:

```text
PlayerCsrfGuard
PlayerAccountThrottlerGuard
```

### Avatar e banner

Contratos:

```text
POST   /player/profile/me/avatar
DELETE /player/profile/me/avatar
POST   /player/profile/me/banner
DELETE /player/profile/me/banner
```

Uploads usam o campo multipart:

```text
file
```

As mutações são protegidas por autenticação, CSRF e throttling.

### Profile por slug

Contrato:

```text
GET /player/profiles/:slug
```

Esse contrato exige usuário HSC autenticado.

A visibilidade chamada `public` significa:

```text
member-visible
```

Ou seja: visível para usuários HSC autenticados.

Não significa profile público para a Internet.

Profile privado não deve ser exposto a outro usuário.

Para evitar disclosure desnecessário, profile privado ou inexistente pode responder de forma não distinguível com:

```text
404 player_not_found
```

## Membership

Tabela principal:

```text
player_memberships
```

Existe no máximo um membership por player account.

Estados persistidos:

```text
inactive
active
suspended
expired
cancelled
```

Sources modeladas:

```text
manual
staff
promotion
subscription
```

A implementação administrativa atual cria memberships com:

```text
source = staff
```

### Effective status

O status efetivo é resolvido em tempo de leitura/autorização.

Regras:

- `expired` permanece terminal;
- `cancelled` permanece terminal;
- membership não terminal com `expires_at <= UTC_TIMESTAMP()` é efetivamente `expired`;
- status ou datas inválidos devem falhar de forma fechada.

### Membership do próprio player

Contrato:

```text
GET /player/membership
```

Proteção:

```text
PlayerAuthGuard
```

A ausência de membership não significa que a conta não exista.

## Administração de memberships

Base:

```text
/admin/memberships
```

Proteção:

```text
AdminAuthGuard
```

Contratos:

```text
POST /admin/memberships

GET /admin/memberships/:id
GET /admin/memberships/by-player/:playerAccountId

POST /admin/memberships/:id/activate
POST /admin/memberships/:id/suspend
POST /admin/memberships/:id/reactivate
POST /admin/memberships/:id/cancel
```

Grant administrativo exige:

```text
player_account_id
plan_code
```

`expires_at` é opcional, mas quando fornecido deve representar UTC com sufixo `Z`.

Transições inválidas retornam conflito em vez de alterar silenciosamente o lifecycle.

Mutações administrativas devem registrar auditoria.

## Administração de player accounts

Base:

```text
/admin/player-accounts
```

Proteção:

```text
AdminAuthGuard
```

Contratos:

```text
GET /admin/player-accounts
GET /admin/player-accounts/:id
PATCH /admin/player-accounts/:id
```

A listagem suporta filtros administrativos definidos pelo controller, incluindo status e limite.

Status gerenciáveis:

```text
active
disabled
```

Ao desabilitar uma conta:

- status passa a `disabled`;
- `disabled_at` é preenchido;
- sessões player ativas são revogadas na mesma operação;
- auditoria é registrada na mesma operação transacional.

Ao reativar:

- status volta a `active`;
- `disabled_at` é limpo;
- sessões antigas não são restauradas.

O Backoffice deve consumir esses contratos.

O Backoffice não deve acessar diretamente as tabelas player.

## Server Access

Contrato interno:

```text
POST /internal/server-access/authorize
```

Header:

```text
x-internal-key: <SERVER_ACCESS_INTERNAL_API_KEY>
```

Body:

```json
{
  "steamid64": "76561190000000000"
}
```

A credencial utilizada por Server Access é:

```text
SERVER_ACCESS_INTERNAL_API_KEY
```

Ela é separada de:

```text
INTERNAL_API_KEY
```

`INTERNAL_API_KEY` continua pertencendo ao contrato de Steam Profiles e outras integrações que explicitamente o utilizem.

Não reutilizar uma credencial como substituta da outra.

### Decisão

Fluxo:

```text
SteamID64
→ identidade Steam vinculada?
→ player account active?
→ membership existe?
→ effective membership active?
→ authorized
```

Razões de decisão conhecidas:

```text
membership_active
steam_identity_not_linked
player_account_disabled
membership_required
membership_inactive
membership_suspended
membership_expired
membership_cancelled
```

Somente:

```text
membership_active
```

autoriza acesso.

Exemplo de autorização:

```json
{
  "ok": true,
  "authorized": true,
  "reason": "membership_active"
}
```

Business denial continua usando HTTP `200`:

```json
{
  "ok": true,
  "authorized": false,
  "reason": "membership_required"
}
```

Erros de infraestrutura, configuração ou autenticação interna usam status HTTP apropriado e não devem ser confundidos com decisão de negócio.

### Fail-closed

Server Access deve falhar fechado.

Nenhum fluxo de Server Access pode:

- criar player account;
- criar Steam identity;
- criar membership;
- ativar conta;
- alterar membership;
- inferir autorização pela existência de SteamID.

## Relação com o servidor CS2

A Auth API é dona da decisão de elegibilidade.

A integração futura com plugin ou servidor CS2 deverá consumir esse contrato interno.

O plugin/servidor não deve reimplementar regras de:

```text
account status
identity ownership
membership effective status
```

Integração concreta com HSC Admin Tools ou servidor CS2 é outra frente e não faz parte deste documento.

## Segurança

### CSRF

O cookie player pode operar cross-origin em HTTPS.

Por isso, CORS não é defesa CSRF suficiente.

Mutações relevantes protegidas por cookie usam validação de `Origin`.

Erros conhecidos:

```text
csrf_origin_required
csrf_origin_forbidden
```

### Rate limiting

Fluxos sensíveis possuem throttling escopado.

Exemplos atuais:

```text
email login
registration
password reset request
email link request
profile update
avatar/banner mutations
```

Trackers não devem armazenar e-mail ou player account ID em plaintext.

### Tokens e cookies

Nunca registrar:

- token bruto;
- cookie real;
- `Set-Cookie` real;
- token hash completo;
- callback Steam completo;
- password reset token;
- verification token;
- email-link token;
- internal API keys.

## Migrations relacionadas

Evolução player recente:

```text
0012_player_email_auth.sql
0013_player_email_password_reset.sql
0014_player_identity_linking.sql
0015_player_profiles.sql
0016_player_memberships.sql
```

Migrations são aplicadas separadamente do runtime HTTP.

Aplicação local:

```bash
ENV_FILE=.env.local npm run db:migrate
```

A aplicação local dessas migrations não implica que tenham sido aplicadas em produção.

Estado de produção deve ser validado separadamente antes de qualquer rollout.

## Smoke local

Referência canônica:

```text
docs/local-smoke.md
```

Comando:

```bash
ENV_FILE=.env.local npm run smoke:local
```

O smoke valida fronteiras essenciais e controles de segurança sem criar contas, memberships ou identidades.

Cenários funcionais completos permanecem nas suítes automatizadas direcionadas.

## Fronteiras de produto

A principal utilidade atual do membership é habilitar elegibilidade para ambientes/partidas HSC de CS2.

Não inferir a existência de uma área web exclusiva de membership.

O Bunker e as stats pertencem à Área do Jogador e não constituem, por si só, benefício de membership.

Fluxo conceitual:

```text
HSC account active
→ authenticate
→ profile
→ account/security
→ membership visibility

Steam linked/verified
→ CS2 identity-dependent features
→ personalized stats
→ eligibility component for server access

Account active
+ Steam linked/verified
+ effective membership active
→ server access
```
