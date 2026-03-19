// src/services/auth/magicLinkDelivery.js
import {
  MAGIC_LINK_FROM_EMAIL,
  MAGIC_LINK_SUBJECT,
} from "../../config/auth.js";

export async function deliverMagicLink({
  email,
  consumeUrl,
  expiresAt,
}) {
  /**
   * Fase atual:
   * - não envia email real ainda
   * - apenas loga em ambiente não-produtivo
   *
   * Próxima fase:
   * - plugar provider real (Resend / SES / etc.)
   */
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[auth-magic-link] to=${email} from=${MAGIC_LINK_FROM_EMAIL} subject="${MAGIC_LINK_SUBJECT}" consumeUrl=${consumeUrl} expiresAt=${expiresAt}`,
    );
  }

  return {
    ok: true,
  };
}