# ADR 0002 — Direct NestJS Replacement

## Metadados

- **Data:** 2026-08-06
- **Repositório:** `14vosx/hsc-auth-api`
- **Autoridade:** Decisão aprovada pelo responsável humano do projeto.
- **Relacionamento:** Supersede parcialmente o ADR 0001 apenas na estratégia de transição.

## Status

Accepted

## Contexto

O ADR 0001 definiu corretamente a arquitetura-alvo do `hsc-auth-api`:

- NestJS 11;
- TypeScript em modo estrito;
- monólito modular;
- Express adapter inicialmente;
- MariaDB/MySQL com `mysql2`;
- migrations SQL executadas por CLI independente;
- processo Node.js único;
- pipeline HTTP único;
- corte HTTP atômico;
- proibição de coexistência entre aplicações Express e NestJS.

O ADR 0001 também definiu uma etapa intermediária de desacoplamento incremental das regras de negócio ainda sob o runtime Express.

Durante a execução, ficou comprovado que essa etapa intermediária aumenta o custo, o tempo e o volume de trabalho sobre uma implementação que será integralmente removida.

O projeto é mantido por um desenvolvedor solo e precisa priorizar entrega funcional, simplicidade operacional e eliminação rápida do legado.

## Decisão

A etapa de desacoplamento incremental sob Express está cancelada.

A aplicação NestJS será construída como substituição direta e completa da aplicação Express existente.

O Express legado ficará congelado e poderá ser consultado somente como referência para:

- contratos HTTP;
- regras de autenticação;
- queries SQL;
- cookies e sessões;
- integrações externas;
- comportamento funcional atualmente publicado.

Nenhuma nova funcionalidade, refatoração, seam, abstração, correção arquitetural ou teste será adicionada ao Express legado.

## Alteração da sequência de execução

### Gate 0A-03

Considerado encerrado com a caracterização já aprovada e a baseline de 393 testes.

Não serão implementados novos contratos ou novas permutações de testes contra o Express.

### Gate 0A-04

Cancelado.

Não haverá extração incremental de núcleo framework-agnostic sob o runtime Express.

### Gate 0A-05

Passa a executar o replacement NestJS direto em branch ou worktree isolada.

Inclui:

- instalação do NestJS 11 e TypeScript;
- configuração `strict: true`;
- bootstrap usando o `buildAppConfig` já validado;
- criação dos módulos NestJS;
- implementação direta de controllers, services e repositories;
- preservação do MariaDB/MySQL e `mysql2`;
- preservação das migrations SQL via CLI;
- implementação dos contratos HTTP necessários;
- validação local do runtime NestJS completo.

O NestJS não poderá importar:

- `createExpressApp`;
- registradores de `src/routes`;
- composition root Express;
- middlewares Express legados;
- handlers que dependam de `req` e `res`;
- qualquer mecanismo de fallback para o legado.

Código puro e infraestrutura sem dependência do Express poderão ser reutilizados quando isso reduzir trabalho e não carregar acoplamento legado.

### Gate 0A-06

Permanece como corte HTTP atômico.

O corte deverá:

- tornar o NestJS o único proprietário do pipeline HTTP;
- remover a inicialização Express;
- remover `src/routes` e o composition root legado;
- remover arquivos e imports mortos;
- remover testes exclusivamente acoplados ao runtime Express;
- manter somente testes úteis ao NestJS, regras puras, persistência e contratos realmente necessários;
- produzir um único processo, um único listener e um único deployment.

## Política de testes

Os 393 testes existentes não constituem uma obrigação de migração individual.

Durante o replacement:

- testes de regras puras e infraestrutura reutilizada poderão permanecer;
- asserções contratuais relevantes poderão ser adaptadas ao NestJS;
- testes acoplados a `createExpressApp`, `routesDeps` ou registradores Express poderão ser removidos;
- não será recriada toda a matriz de testes do legado;
- a prioridade será segurança, autenticação, persistência, contratos consumidos pelos frontends e funcionamento de produção.

A aprovação do replacement dependerá de:

- build TypeScript sem erros;
- inicialização NestJS válida;
- testes focados nas áreas críticas;
- smoke tests dos endpoints publicados;
- validação de cookies, autenticação, CORS, uploads e erros;
- aprovação humana antes do corte.

## Restrições preservadas

Continuam proibidos:

- runtime híbrido Express/NestJS;
- montagem de uma aplicação dentro da outra;
- fallback entre frameworks;
- divisão temporária de rotas;
- dois processos ou duas portas para a mesma API;
- migrations automáticas no startup;
- introdução de ORM durante a migração;
- coexistência de ambos os frameworks na aplicação publicada.

## Consequências

### Positivas

- redução imediata do trabalho sobre código descartável;
- início mais rápido da implementação definitiva;
- menor consumo de tempo e contexto;
- remoção antecipada de abstrações transitórias;
- caminho direto para publicação.

### Riscos

- algumas regras hoje misturadas ao transporte precisarão ser reimplementadas diretamente;
- parte dos testes de caracterização será removida;
- erros de paridade deverão ser detectados por testes focados e smoke tests.

Esses riscos são aceitos em troca da redução substancial de complexidade e tempo de execução.

## Resultado

O `hsc-auth-api` seguirá diretamente para a implementação completa em NestJS.

O Express legado está congelado, não será evoluído e será removido integralmente no corte atômico.
