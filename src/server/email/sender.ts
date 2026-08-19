import "server-only";

import { Resend } from "resend";
import { getEnv } from "@/server/config/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info("[email:console]", {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const resend = new Resend(this.apiKey);
    const result = await resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

export function getEmailSender(): EmailSender {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY.trim();
  const from = env.EMAIL_FROM.trim() || "GH Points <noreply@localhost>";
  if (apiKey) {
    return new ResendEmailSender(apiKey, from);
  }
  return new ConsoleEmailSender();
}

export function buildOtpEmail(code: string): Omit<EmailMessage, "to"> {
  return {
    subject: "Tu código de GH Points",
    text: `Tu código de acceso es ${code}. Expira en 10 minutos. Si no lo pediste, ignora este correo.`,
    html: `<p>Tu código de acceso es <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>Expira en 10 minutos. Si no lo pediste, ignora este correo.</p>`,
  };
}

export function buildLoginEmail(input: {
  code: string;
  magicUrl: string;
  ttlMinutes: number;
}): Omit<EmailMessage, "to"> {
  return {
    subject: "Tu acceso a GH Points",
    text: `Tu código de acceso es ${input.code}. También puedes entrar con este enlace: ${input.magicUrl}. Expira en ${input.ttlMinutes} minutos. Si no lo pediste, ignora este correo.`,
    html: `<p>Tu código de acceso es <strong style="font-size:24px;letter-spacing:4px">${input.code}</strong>.</p><p>O entra con este <a href="${input.magicUrl}">enlace mágico</a>.</p><p>Expira en ${input.ttlMinutes} minutos. Si no lo pediste, ignora este correo.</p>`,
  };
}
