# PR-1 — Curl Suite (Local) — Auth + Admin (Session-based)

Pré-requisitos:
- API rodando em http://127.0.0.1:3000 (./ops/dev.sh)
- Em DEV, /auth/request-link loga o link com token no console do servidor

## Setup
```bash
cd ~/work/hsc/hsc-auth-api
set -a; . ./.env.local; set +a
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/hsc_cookie_pr1.txt"
rm -f "$COOKIE"
```

## 1) Request link (anti-enumeração)
```bash
curl -sS -X POST "$BASE_URL/auth/request-link" -H "Content-Type: application/json" -d '{"email":"test+local@hsc.dev"}' | cat
```

Copie do log do servidor o token (64 hex) da URL /auth/verify?token=...

## 2) Verify (cria sessão + cookie HttpOnly)
```bash
export TOKEN="COLE_TOKEN_64HEX_AQUI"
curl -sS -i "$BASE_URL/auth/verify?token=$TOKEN" -c "$COOKIE" | sed -n '1,12p'
```

## 3) Me (sessão válida)
```bash
curl -sS "$BASE_URL/auth/me" -b "$COOKIE" | cat
```

## 4) Admin via sessão (session-first)
(requer role=admin)
```bash
curl -sS "$BASE_URL/admin/schema" -b "$COOKIE" | cat
```

## 5) Admin via break-glass (X-Admin-Key)
```bash
curl -sS "$BASE_URL/admin/schema" -H "X-Admin-Key: $ADMIN_KEY" | cat
```

## 6) Logout
```bash
curl -sS -X POST "$BASE_URL/auth/logout" -b "$COOKIE" | cat
```

## 7) Me após logout (negativo)
```bash
curl -sS -i "$BASE_URL/auth/me" -b "$COOKIE" | tail -n 2
```

## 8) Verify com token já usado (negativo)
```bash
curl -sS -i "$BASE_URL/auth/verify?token=$TOKEN" | tail -n 2
```
