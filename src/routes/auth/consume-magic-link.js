// src/routes/auth/consume-magic-link.js
import {
  BACKOFFICE_URL,
  MAGIC_LINK_CALLBACK_PATH,
  ADMIN_SESSION_TTL_HOURS,
} from "../../config/auth.js";
import { createSessionForUser } from "../../db/adminSessions.js";
import {
  findUsableMagicLinkByToken,
  markMagicLinkAsUsed,
} from "../../db/magicLinks.js";
import { buildAdminSessionCookie } from "../../utils/sessionCookie.js";
import {
  MAGIC_LINK_CALLBACK_STATUS_OK,
  MAGIC_LINK_CALLBACK_ERROR_DB_NOT_READY,
  MAGIC_LINK_CALLBACK_ERROR_MISSING_TOKEN,
  MAGIC_LINK_CALLBACK_ERROR_INVALID_OR_EXPIRED_LINK,
  MAGIC_LINK_CALLBACK_ERROR_FORBIDDEN,
  MAGIC_LINK_CALLBACK_ERROR_CONSUME_FAILED,
} from "../../services/auth/magicLinkContract.js";

function buildCallbackUrl(query = "") {
  return `${BACKOFFICE_URL}${MAGIC_LINK_CALLBACK_PATH}${query}`;
}

export function registerAuthConsumeMagicLinkRoute(app, { dbConfig, getDbReady }) {
  app.get("/auth/magic-link/consume", async (req, res) => {
    if (!getDbReady()) {
      return res.redirect(
        buildCallbackUrl(`?error=${MAGIC_LINK_CALLBACK_ERROR_DB_NOT_READY}`),
      );
    }

    const rawToken = String(req.query?.token || "").trim();

    if (!rawToken) {
      return res.redirect(buildCallbackUrl(`?error=${MAGIC_LINK_CALLBACK_ERROR_MISSING_TOKEN}`));
    }

    try {
      const magicLink = await findUsableMagicLinkByToken(dbConfig, rawToken);

      if (!magicLink) {
        return res.redirect(buildCallbackUrl(`?error=${MAGIC_LINK_CALLBACK_ERROR_INVALID_OR_EXPIRED_LINK}`));
      }

      if (magicLink.role !== "admin") {
        return res.redirect(buildCallbackUrl(`?error=${MAGIC_LINK_CALLBACK_ERROR_FORBIDDEN}`));
      }

      const session = await createSessionForUser(
        dbConfig,
        magicLink.userId,
        ADMIN_SESSION_TTL_HOURS,
      );

      await markMagicLinkAsUsed(dbConfig, magicLink.magicLinkId);

      res.setHeader("Set-Cookie", buildAdminSessionCookie(session.rawToken));

      return res.redirect(
        buildCallbackUrl(`?status=${MAGIC_LINK_CALLBACK_STATUS_OK}`),
      );
    } catch (err) {
      console.error("[auth-magic-link] consume failed:", err);
      return res.redirect(
        buildCallbackUrl(`?error=${MAGIC_LINK_CALLBACK_ERROR_CONSUME_FAILED}`),
      );
    }
  });
}