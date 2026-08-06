// src/services/auth/magicLinkDelivery.js
import nodemailer from "nodemailer";
import { buildAuthConfig } from "../../config/auth.js";

function buildMagicLinkEmailHtml({ consumeUrl, expiresAt }) {
  return ` <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;"> <h2>HSC Backoffice Admin</h2> <p>Use o link abaixo para acessar o Backoffice:</p> <p> <a href="${consumeUrl}" target="_blank" rel="noopener noreferrer"> Entrar no Backoffice </a> </p> <p>Este link expira em: <strong>${expiresAt} UTC</strong></p> <p>Se você não solicitou este acesso, ignore este email.</p> </div> `;
}

function buildMagicLinkEmailText({ consumeUrl, expiresAt }) {
  return [
    "HSC Backoffice Admin",
    "",
    "Use o link abaixo para acessar o Backoffice:",
    consumeUrl,
    "",
    `Este link expira em: ${expiresAt} UTC`,
    "",
    "Se você não solicitou este acesso, ignore este email.",
  ].join("\n");
}

function ensureSmtpConfig(config) {
  const host = config.smtpHost;
  const port = config.smtpPort;
  const user = config.smtpUser;
  const pass = config.smtpPass;
  const fromEmail = config.magicLinkFromEmail;

  if (!host) throw new Error("smtp_host_missing");
  if (!port || Number.isNaN(port)) throw new Error("smtp_port_invalid");
  if (!user) throw new Error("smtp_user_missing");
  if (!pass) throw new Error("smtp_pass_missing");
  if (!fromEmail) throw new Error("magic_link_from_email_missing");
}

function createTransport(config) {
  ensureSmtpConfig(config);

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

export async function deliverMagicLink(
  { email, consumeUrl, expiresAt },
  authConfig = buildAuthConfig(),
) {
  const config = { ...buildAuthConfig(), ...authConfig };
  const transporter = createTransport(config);
  const info = await transporter.sendMail({
    from: config.magicLinkFromEmail,
    to: email,
    subject: config.magicLinkSubject,
    text: buildMagicLinkEmailText({
      consumeUrl,
      expiresAt,
    }),
    html: buildMagicLinkEmailHtml({
      consumeUrl,
      expiresAt,
    }),
  });
  console.log(
    `[auth-magic-link] delivered to=${email} messageId=${info.messageId}`,
  );
  return {
    ok: true,
    messageId: info.messageId,
  };
}