# Baseline Smoke (pré-refactor)

## Como rodar (HSC DEV)
Subir:
- `ENV_FILE=.env.local npm start`

Smoke:
- `export PORT=3000`
- `export ALLOWED_ORIGIN="http://localhost:5173"`
- `export ADMIN_KEY="dev-admin-key"`
- `./ops/smoke-baseline.sh`

> Campos voláteis: `ts`, headers `Date` e `ETag` mudam a cada request.

## Contrato esperado
- GET `/health` => 200, `db.ready=true`, `cors.allowedOrigin=ALLOWED_ORIGIN`
- GET `/content/news` => 200, `{ ok, count, items }`
- GET `/content/seasons` => 200, `{ ok, generatedAt, data }`
- GET `/admin/schema` (com `X-Admin-Key`) => 200, `{ ok, version, tables }`
- CORS: header `Access-Control-Allow-Origin: http://localhost:5173`
