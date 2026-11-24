import type { Address } from "./types.js";

export interface InlineImage {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface OutgoingAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * What the application may ask to send. The From address is NOT part of it on purpose:
 * it always comes from the sender's configuration (the logged-in user), so it cannot be forged.
 */
export interface OutgoingMessage {
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  inlineImages?: InlineImage[];
  attachments?: OutgoingAttachment[];
}

export interface SentMessage {
  messageId: string;
  /** Complete RFC 822 message as sent (without Bcc). Save it to the Sent folder. */
  raw: Buffer;
  accepted: string[];
  rejected: string[];
}

export interface MailSender {
  send(message: OutgoingMessage): Promise<SentMessage>;
}

export type OutgoingErrorCode =
  | "no-recipients"
  | "too-many-recipients"
  | "invalid-address"
  | "invalid-subject"
  | "invalid-header"
  | "attachments-too-large"
  | "empty-body";

export class OutgoingMessageError extends Error {
  constructor(
    readonly code: OutgoingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutgoingMessageError";
  }
}

export const OUTGOING_LIMITS = {
  recipients: 100,
  subjectLength: 998,
  attachmentBytes: 20 * 1024 * 1024,
  references: 20,
} as const;

const EMAIL = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;
const LINE_BREAK = new RegExp(
  `[\\r\\n${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}${String.fromCharCode(0)}]`,
);
const MESSAGE_ID = /^<[^\s<>\r\n]+>$/;

/** Throws OutgoingMessageError when the message is unsafe or incomplete. */
export function validateOutgoing(message: OutgoingMessage): void {
  const all = [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])];
  if (all.length === 0) throw new OutgoingMessageError("no-recipients", "Chýba príjemca.");
  if (all.length > OUTGOING_LIMITS.recipients) {
    throw new OutgoingMessageError("too-many-recipients", "Príliš veľa príjemcov.");
  }
  for (const address of all) {
    if (!EMAIL.test(address.email) || (address.name && LINE_BREAK.test(address.name))) {
      throw new OutgoingMessageError("invalid-address", `Neplatná adresa: ${address.email}`);
    }
  }
  if (LINE_BREAK.test(message.subject) || message.subject.length > OUTGOING_LIMITS.subjectLength) {
    throw new OutgoingMessageError("invalid-subject", "Neplatný predmet.");
  }
  if (message.inReplyTo !== undefined && !MESSAGE_ID.test(message.inReplyTo)) {
    throw new OutgoingMessageError("invalid-header", "Neplatná hlavička In-Reply-To.");
  }
  for (const reference of message.references ?? []) {
    if (!MESSAGE_ID.test(reference)) {
      throw new OutgoingMessageError("invalid-header", "Neplatná hlavička References.");
    }
  }
  const files = [...(message.attachments ?? []), ...(message.inlineImages ?? [])];
  for (const file of files) {
    if (LINE_BREAK.test(file.filename) || LINE_BREAK.test(file.contentType)) {
      throw new OutgoingMessageError("invalid-header", "Neplatný názov alebo typ prílohy.");
    }
  }
  const bytes = files.reduce((sum, f) => sum + f.content.length, 0);
  if (bytes > OUTGOING_LIMITS.attachmentBytes) {
    throw new OutgoingMessageError("attachments-too-large", "Prílohy sú príliš veľké.");
  }
  if (message.html.trim() === "" || message.text.trim() === "") {
    throw new OutgoingMessageError("empty-body", "Správa nemá obsah.");
  }
}

/**
 * Threading headers for a reply, from the message being answered. Keeps the last 20 references
 * so the header never grows without limit.
 */
export function replyHeaders(original: { messageId: string; references: string[] }): {
  inReplyTo: string;
  references: string[];
} {
  const references = [...original.references, original.messageId].filter((id) =>
    MESSAGE_ID.test(id),
  );
  return {
    inReplyTo: original.messageId,
    references: references.slice(-OUTGOING_LIMITS.references),
  };
}
