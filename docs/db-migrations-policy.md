# HSC Auth API — Política de Migrations de Banco

## Fonte única da verdade

A partir deste ponto, toda evolução de schema do banco deve ser implementada por meio de:

- `db/migrations/*.sql`

Este é o caminho canônico de migrations do projeto.

## Arquivo legado

`src/db/schema.js` agora é um arquivo de compatibilidade legada.

Ele pode permanecer temporariamente por razões históricas e de compatibilidade, mas não é mais o mecanismo principal de evolução do schema.

Não adicione novas features de schema nele.

## Regra operacional

O fluxo de deploy deve executar migrations explicitamente antes de reiniciar a aplicação:

1. instalar dependências
2. executar `npm run db:migrate`
3. reiniciar o serviço
4. executar os smoke tests

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

## Regra de baseline

Ambientes existentes são baselined por meio da tabela `schema_migrations`.

Ambientes novos devem ser inicializados a partir do diretório de migrations SQL.