import {
  Inject,
  Injectable,
} from "@nestjs/common";
import nodemailer from "nodemailer";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";

@Injectable()
export class PlayerEmailPasswordResetDeliveryService {
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

    const url = new URL(
      this.config.playerEmailAuth.passwordResetUrl,
      `${this.config.runtime.publicUrl.replace(/\/+$/, "")}/`,
    );

    url.searchParams.set("token", input.rawToken);

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
        this.config.playerEmailAuth.passwordResetSubject,
      text: [
        "HSC",
        "",
        "Use o link abaixo para redefinir sua senha:",
        url.toString(),
        "",
        `Este link expira em: ${input.expiresAt} UTC`,
        "",
        "Se você não solicitou esta alteração, ignore este email.",
      ].join("\n"),
    });
  }
}
