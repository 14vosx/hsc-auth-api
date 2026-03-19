// src/services/auth/magicLinkDelivery.js 
import nodemailer from "nodemailer";
import {
  MAGIC_LINK_FROM_EMAIL,
  MAGIC_LINK_SUBJECT,
  getSmtpHost,
  getSmtpPort,
  getSmtpSecure,
  getSmtpUser,
  getSmtpPass,
} from "../../config/auth.js";

function buildMagicLinkEmailHtml({
  consumeUrl,
  expiresAt
}) {
  return ` <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;"> <h2>HSC Backoffice Admin</h2> <p>Use o link abaixo para acessar o Backoffice:</p> <p> <a href="${consumeUrl}" target="_blank" rel="noopener noreferrer"> Entrar no Backoffice </a> </p> <p>Este link expira em: <strong>${expiresAt} UTC</strong></p> <p>Se você não solicitou este acesso, ignore este email.</p> </div> `;
}

function buildMagicLinkEmailText({
  consumeUrl,
  expiresAt
}) {
  return ["HSC Backoffice Admin", "", "Use o link abaixo para acessar o Backoffice:", consumeUrl, "", `Este link expira em: ${expiresAt} UTC`, "", "Se você não solicitou este acesso, ignore este email.", ].join("\n");
}

function ensureSmtpConfig() {
  const host = getSmtpHost();
  const port = getSmtpPort();
  const user = getSmtpUser();
  const pass = getSmtpPass();

  if (!host) throw new Error("smtp_host_missing");
  if (!port || Number.isNaN(port)) throw new Error("smtp_port_invalid");
  if (!user) throw new Error("smtp_user_missing");
  if (!pass) throw new Error("smtp_pass_missing");
  if (!MAGIC_LINK_FROM_EMAIL) throw new Error("magic_link_from_email_missing");
}

function createTransport() {
  ensureSmtpConfig();

  return nodemailer.createTransport({
    host: getSmtpHost(),
    port: getSmtpPort(),
    secure: getSmtpSecure(),
    auth: {
      user: getSmtpUser(),
      pass: getSmtpPass(),
    },
  });
}
export async function deliverMagicLink({
  email,
  consumeUrl,
  expiresAt
}) {
  const transporter = createTransport();
  const info = await transporter.sendMail({
      from: MAGIC_LINK_FROM_EMAIL,
      to: email,
      subject: MAGIC_LINK_SUBJECT,
      text: buildMagicLinkEmailText({
          consumeUrl,
          expiresAt
      }),
      html: buildMagicLinkEmailHtml({
          consumeUrl,
          expiresAt
      }),
  });
  console.log(`[auth-magic-link] delivered to=${email} messageId=${info.messageId}`, );
  return {
      ok: true,
      messageId: info.messageId,
  };
}