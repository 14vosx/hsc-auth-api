import { Injectable, Inject } from "@nestjs/common";
import nodemailer from "nodemailer";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";

function buildMagicLinkEmailHtml({
  consumeUrl,
  expiresAt,
}: {
  consumeUrl: string;
  expiresAt: string;
}): string {
  return ` <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;"> <h2>HSC Backoffice Admin</h2> <p>Use o link abaixo para acessar o Backoffice:</p> <p> <a href="${consumeUrl}" target="_blank" rel="noopener noreferrer"> Entrar no Backoffice </a> </p> <p>Este link expira em: <strong>${expiresAt} UTC</strong></p> <p>Se você não solicitou este acesso, ignore este email.</p> </div> `;
}

function buildMagicLinkEmailText({
  consumeUrl,
  expiresAt,
}: {
  consumeUrl: string;
  expiresAt: string;
}): string {
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

@Injectable()
export class AdminMagicLinkDeliveryService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async deliver(input: {
    email: string;
    consumeUrl: string;
    expiresAt: string;
  }): Promise<void> {
    const authConfig = this.config.adminAuth;
    const mailTransport = this.config.mailTransport;

    const host = mailTransport.host;
    const port = mailTransport.port;
    const user = mailTransport.user;
    const pass = mailTransport.pass;
    const fromEmail = authConfig.magicLinkFromEmail;

    if (!host) throw new Error("smtp_host_missing");
    if (!port || Number.isNaN(port)) throw new Error("smtp_port_invalid");
    if (!user) throw new Error("smtp_user_missing");
    if (!pass) throw new Error("smtp_pass_missing");
    if (!fromEmail) throw new Error("magic_link_from_email_missing");

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: mailTransport.secure,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from: fromEmail,
      to: input.email,
      subject: authConfig.magicLinkSubject,
      text: buildMagicLinkEmailText({
        consumeUrl: input.consumeUrl,
        expiresAt: input.expiresAt,
      }),
      html: buildMagicLinkEmailHtml({
        consumeUrl: input.consumeUrl,
        expiresAt: input.expiresAt,
      }),
    });
  }
}
