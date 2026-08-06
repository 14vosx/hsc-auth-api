# HSC Auth API — Política de Migrations de Banco

## Fonte única da verdade

A partir deste ponto, toda evolução de schema do banco deve ser implementada por meio de:

- `db/migrations/*.sql`

Este é o caminho canônico de migrations do projeto.

## Arquivo legado

`src/db/schema.js` agora é um arquivo de compatibilidade legada.

Ele pode permanecer temporariamente por razões históricas e de compatibilidade, mas não é mais o mecanismo principal de evolução do schema.

Não adicione novas features de schema nele.

## Regra operacional e arquitetura do runner

O fluxo de deploy executa migrations explicitamente antes de reiniciar a aplicação:

1. instalar dependências
2. executar `npm run db:migrate`
3. reiniciar o serviço
4. executar os smoke tests

### Conexão dedicada e `multipleStatements: true`

- O runner de migrations (`scripts/migrationRunner.js`) cria uma conexão **dedicada** para a execução de migrations com a propriedade `multipleStatements: true`.
- Esta configuração é **restrita exclusivamente ao runner** de migrations.
- O pool e conexões de runtime da aplicação (`src/config/db.js` e `src/app/context.js`) permanecem **sem** `multipleStatements: true` para mitigar riscos de SQL Injection no runtime da API.

### Advisory Lock para Concorrência

- Para impedir execuções concorrentes (ex: múltiplos containers ou instâncias durante o rollout), o runner adquire um **Advisory Lock** nomeado (`hsc_auth_api_migrations`) com timeout explícito (10s) via `SELECT GET_LOCK(...)`.
- O lock é liberado via `SELECT RELEASE_LOCK(...)` no bloco `finally` ao término da migração.

### Ausência de Atomicidade para DDL (MariaDB / MySQL)

- Instruções DDL (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, etc.) em MariaDB/MySQL realizam **commit implícito** imediato e não aceitam rollback transacional.
- Portanto, o runner **não envolve** arquivos DDL em transações `beginTransaction`/`rollback`, evitando falsas expectativas de atomicidade.
- Migrations exclusivamente DML que exijam atomicidade devem declarar `START TRANSACTION;` e `COMMIT;` explicitamente dentro do próprio arquivo SQL.

### Janela de Atualização de Metadados e Idempotência

- A tabela `schema_migrations` é atualizada estritamente **após** a conclusão com sucesso do script SQL inteiro da migration.
- Existe uma janela pontual entre a execução do SQL e o registro na `schema_migrations`. Em caso de falha de conexão nessa janela, o script SQL foi aplicado no banco, mas a migration não foi registrada.
- **Regra de idempotência:** Todas as migrations multi-statement devem ser projetadas para **reexecução segura** utilizando `CREATE TABLE IF NOT EXISTS`, checagens via `information_schema` em blocos MariaDB (`BEGIN NOT ATOMIC`), ou cláusulas defensivas.

### Proibição de Edição de Migrations Aplicadas

- Migrations que já foram aplicadas em qualquer ambiente **nunca devem ser editadas**.
- Correções ou alterações em schemas existentes devem ser entregues em uma **nova migration numerada** subsequente.

## Regra de runtime

O runtime da aplicação não deve ser responsável por evoluir schema.

O runtime pode apenas validar a disponibilidade do banco.

## Regra prática para novos desenvolvimentos

Toda nova mudança de banco deve ser entregue como arquivo de migration, por exemplo:

- nova tabela
- nova coluna
- novo índice
- nova constraint
- backfill de dados vinculado ao rollout de schema

## Regra de baseline e validação local

Ambientes existentes são baselined por meio da tabela `schema_migrations`.

Ambientes novos devem ser inicializados a partir do diretório de migrations SQL.

O fluxo de validação local para um banco limpo deve ser:

```bash
npm run db:migrate
```

Após a execução inicial, uma segunda execução do comando deve retornar obrigatoriamente a mensagem no-op:

```text
✅ No pending migrations.
```