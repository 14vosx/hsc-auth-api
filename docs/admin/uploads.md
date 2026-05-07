# Admin Uploads

## Contexto

Este documento registra o contrato local do endpoint administrativo de upload do `hsc-auth-api`.

O endpoint permite que o Backoffice Admin envie imagens e receba uma URL pública pronta para persistir em entidades de domínio, como `news.image_url` e, futuramente, `seasons.cover_image_url`.

O endpoint não altera News ou Seasons diretamente. Ele apenas salva o arquivo validado, registra auditoria administrativa e retorna a URL pública.

## Endpoint

POST `/admin/uploads`

Autenticação:

- sessão administrativa válida; ou
- `X-Admin-Key` em fluxos locais/break-glass já suportados pelo backend.

Content-Type:

- `multipart/form-data`

Campo esperado:

- `file`

## Tipos aceitos

Primeiro corte:

- `image/jpeg`
- `image/png`
- `image/webp`

Extensões aceitas:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

SVG não é aceito neste corte.

## Variáveis de ambiente

```text
UPLOAD_DIR=./var/uploads
UPLOAD_PUBLIC_PATH=/uploads
UPLOAD_PUBLIC_BASE_URL=http://127.0.0.1:3000
UPLOAD_MAX_BYTES=2097152
```

`UPLOAD_PUBLIC_BASE_URL` define a origem pública usada para montar a URL absoluta retornada.

## Resposta de sucesso

```json
{
  "ok": true,
  "url": "http://127.0.0.1:3000/uploads/20260507T171550813Z-21395de1a0ec0224.png",
  "path": "/uploads/20260507T171550813Z-21395de1a0ec0224.png",
  "filename": "20260507T171550813Z-21395de1a0ec0224.png",
  "size": 70,
  "mimetype": "image/png"
}
```

Campos:

* `url`: URL pública absoluta para persistência em entidades de domínio.
* `path`: path público relativo.
* `filename`: nome final gerado pelo backend.
* `size`: tamanho em bytes.
* `mimetype`: MIME declarado e validado.

## Erros esperados

* `401 Unauthorized`: sem autenticação administrativa.
* `400 missing_file`: nenhum arquivo enviado no campo `file`.
* `400 invalid_file_type`: MIME declarado não permitido.
* `400 invalid_file_signature`: assinatura real do arquivo não corresponde a imagem aceita.
* `400 file_type_mismatch`: MIME declarado e assinatura real divergem.
* `413 file_too_large`: arquivo maior que `UPLOAD_MAX_BYTES`.
* `500 audit_failed`: arquivo removido porque a auditoria administrativa falhou.

## Mitigações aplicadas

* endpoint protegido por `requireAdmin`;
* `db_ready` exigido antes da mutação;
* auditoria administrativa com `action = upload.create`;
* limite de tamanho via Multer;
* campo único esperado: `file`;
* MIME declarado restrito;
* assinatura real validada por magic bytes;
* nome final gerado pelo backend;
* nome original do usuário não é usado como path final;
* publicação estática com `dotfiles: deny`;
* publicação estática com `index: false`;
* publicação estática com `redirect: false`;
* header `X-Content-Type-Options: nosniff`;
* arquivos locais em `var/uploads/`, ignorados pelo Git.

## Smoke local validado

Validações executadas em 2026-05-07:

* `/health` retornou `ok: true` e `db.ready: true`;
* upload sem auth retornou `401`;
* upload sem arquivo retornou `400 missing_file`;
* arquivo `text/plain` retornou `400 invalid_file_type`;
* arquivo `.png` com conteúdo falso retornou `400 invalid_file_signature`;
* arquivo maior que 2 MB retornou `413 file_too_large`;
* PNG válido retornou `201`;
* URL retornada em ambiente local usou `http://127.0.0.1:3000/uploads/...`;
* `GET` da URL retornada respondeu `200`;
* `admin_audit_log` registrou `action = upload.create`.
