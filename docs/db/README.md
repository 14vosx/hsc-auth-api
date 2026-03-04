# HSC — DDL Auditável (SEC-001)

Este diretório contém snapshots do schema REAL do MariaDB (DDL) para auditoria.

## O que o snapshot contém
- `SELECT VERSION()`
- `SHOW VARIABLES LIKE 'collation%'`
- Lista ordenada de tabelas (`BASE TABLE`)
- Check de tabelas críticas
- `SHOW CREATE TABLE` de todas as tabelas (sanitizado para determinismo)

Determinismo:
- remove `AUTO_INCREMENT=NNN` do DDL
- evita timestamps variáveis no header (usa apenas `snapshot_date_utc`)

Script:
- `ops/db/snapshot-schema.sh`

## DEV/local (exemplo)

```bash
ops/db/snapshot-schema.sh --env-file .env.local --tag localtest --out /tmp/hsc_schema_a.md --overwrite
ops/db/snapshot-schema.sh --env-file .env.local --tag localtest --out /tmp/hsc_schema_b.md --overwrite
sha256sum /tmp/hsc_schema_a.md /tmp/hsc_schema_b.md
diff -u /tmp/hsc_schema_a.md /tmp/hsc_schema_b.md
```

## PROD (AWS Lightsail / Contexto B) — modo seguro (fora do repo)
Requisito: app rodando em TAG (ex: `v0.3.1`).

```bash
sudo mkdir -p /var/lib/hsc-audit/db
sudo chown -R hscadmin:hscadmin /var/lib/hsc-audit
sudo chmod 750 /var/lib/hsc-audit /var/lib/hsc-audit/db

OUT="/var/lib/hsc-audit/db/schema_snapshot_$(date -u +%Y%m%d)__v0.3.1.md"

sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/db/snapshot-schema.sh \
  --env-file /opt/hsc/hsc-auth-api/.env \
  --tag v0.3.1 \
  --out "$OUT" \
  --overwrite

sha_a="$(sha256sum "$OUT" | awk '{print $1}')"
sudo -u hscadmin -H /opt/hsc/hsc-auth-api/ops/db/snapshot-schema.sh \
  --env-file /opt/hsc/hsc-auth-api/.env \
  --tag v0.3.1 \
  --out "$OUT" \
  --overwrite
sha_b="$(sha256sum "$OUT" | awk '{print $1}')"

echo "SHA_A=$sha_a"
echo "SHA_B=$sha_b"

grep -nE "(DB_PASS|DB_PASSWORD|MYSQL_PASSWORD|ADMIN_KEY|JWT_SECRET|SESSION_SECRET|API_KEY|PRIVATE_KEY|BEGIN (RSA|EC) PRIVATE KEY|X-Admin-Key|password=|passwd=)" "$OUT" || true
```

Rollback:
- read-only: remover o arquivo gerado em `/var/lib/hsc-audit/db/`.
