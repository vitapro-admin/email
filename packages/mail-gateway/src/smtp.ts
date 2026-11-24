import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { createTransport } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Transporter } from "nodemailer";
import { validateOutgoing } from "./outgoing.js";
import type { MailSender, OutgoingMessage, SentMessage } from "./outgoing.js";
import type { Address } from "./types.js";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = TLS from the start (port 465). Otherwise STARTTLS is required when requireTls is set. */
  secure: boolean;
  /** Require STARTTLS on a plain connection (port 587). Default true. Turn off only for local tests. */
  requireTls?: boolean;
  /** Credentials of the logged-in user. Omit only for local tests. */
  user?: string;
  password?: string;
  /** The sender. Fixed by the application from the logged-in user, never taken from a message. */
  from: Address;
  /** Only for local tests with self-signed certificates. Never enable in production. */
  allowInvalidCertificates?: boolean;
}

function address(a: Address): { name?: string; address: string } {
  return { ...(a.name ? { name: a.name } : {}), address: a.email };
}

/** Builds the complete message (HTML + text alternative, inline images, threading headers). */
export async function buildRawMessage(
  from: Address,
  message: OutgoingMessage,
): Promise<{ raw: Buffer; messageId: string }> {
  validateOutgoing(message);
  const domain = from.email.split("@")[1] ?? "localhost";
  const messageId = `<${randomUUID()}@${domain}>`;

  const composer = new MailComposer({
    from: address(from),
    to: message.to.map(address),
    cc: (message.cc ?? []).map(address),
    // Bcc is used for delivery only; it is never written into the message headers.
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId,
    ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
    ...(message.references?.length ? { references: message.references } : {}),
    attachments: [
      ...(message.inlineImages ?? []).map((image) => ({
        cid: image.cid,
        filename: basename(image.filename),
        content: image.content,
        contentType: image.contentType,
        contentDisposition: "inline" as const,
      })),
      ...(message.attachments ?? []).map((file) => ({
        filename: basename(file.filename),
        content: file.content,
        contentType: file.contentType,
        contentDisposition: "attachment" as const,
      })),
    ],
  });
  const raw = await composer.compile().build();
  return { raw, messageId };
}

/** Sends through SMTP as the configured user. */
export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls ?? true,
      ...(config.user && config.password
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
      tls: { rejectUnauthorized: !config.allowInvalidCertificates },
    });
  }

  async send(message: OutgoingMessage): Promise<SentMessage> {
    const { raw, messageId } = await buildRawMessage(this.config.from, message);
    const recipients = [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map(
      (a) => a.email,
    );
    const info = await this.transport.sendMail({
      envelope: { from: this.config.from.email, to: recipients },
      raw,
    });
    return {
      messageId,
      raw,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  }
}
