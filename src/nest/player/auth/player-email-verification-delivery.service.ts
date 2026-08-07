import { Inject, Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";

function buildVerificationUrl(
  configuredUrl: string,
  publicUrl: string,
  rawToken: string,
): string {
  const url = new URL(
    configuredUrl,
    `${publicUrl.replace(/\/+$/, "")}/`,
  );

  url.searchParams.set("token", rawToken);

  return url.toString();
}

@Injectable()
export class PlayerEmailVerificationDeliveryService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  async deliver(input: {
    email: string;
    rawToken: string;
    expiresAt: string;
  }): Promise<void> {
    const mail = this.config.mailTransport;

    if (!mail.host) {
      throw new Error("smtp_host_missing");
    }

    if (!mail.user) {
      throw new Error("smtp_user_missing");
    }

    if (!mail.pass) {
      throw new Error("smtp_pass_missing");
    }

    const verificationUrl = buildVerificationUrl(
      this.config.playerEmailAuth.verificationUrl,
      this.config.runtime.publicUrl,
      input.rawToken,
    );

    const transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: {
        user: mail.user,
        pass: mail.pass,
      },
    });

    await transporter.sendMail({
      from: this.config.playerEmailAuth.fromEmail,
      to: input.email,
      subject:
        this.config.playerEmailAuth.verificationSubject,
      text: [
        "HSC",
        "",
        "Confirme seu email para ativar sua conta:",
        verificationUrl,
        "",
        `Este link expira em: ${input.expiresAt} UTC`,
        "",
        "Se você não criou esta conta, ignore este email.",
      ].join("\n"),
      html: [
        '<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">',
        "<h2>HSC</h2>",
        "<p>Confirme seu email para ativar sua conta:</p>",
        `<p><a href="${verificationUrl}" target="_blank" rel="noopener noreferrer">Verificar email</a></p>`,
        `<p>Este link expira em: <strong>${input.expiresAt} UTC</strong></p>`,
        "<p>Se você não criou esta conta, ignore este email.</p>",
        "</div>",
      ].join(""),
    });
  }
}
