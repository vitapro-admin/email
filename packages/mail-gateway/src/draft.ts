import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { EMAIL } from "./outgoing.js";
import type { OutgoingAttachment } from "./outgoing.js";
import type { Address } from "./types.js";

/** The editor state travels inside the draft as this hidden attachment, so a draft reopens exactly. */
export const DRAFT_STATE_FILENAME = "aquapro-draft.json";

export interface DraftInput {
  from: Address;
  /** Recipients as typed. Only plausible addresses become headers (the exact input is in `state`). */
  to: Address[];
  subject: string;
  /** Plain-text rendering so other mail clients show something readable. */
  text: string;
  inReplyTo?: string | undefined;
  references?: string[] | undefined;
  /** Everything needed to reopen the draft in this app. Stored as JSON. */
  state: unknown;
  attachments: OutgoingAttachment[];
}

/**
 * Builds the message stored in the Drafts folder. Unlike a message being sent it may be
 * incomplete (no recipient, no subject, no text).
 */
export async function buildDraftRaw(input: DraftInput): Promise<Buffer> {
  const to = input.to.filter((a) => EMAIL.test(a.email));
  const composer = new MailComposer({
    from: { ...(input.from.name ? { name: input.from.name } : {}), address: input.from.email },
    ...(to.length
      ? { to: to.map((a) => ({ ...(a.name ? { name: a.name } : {}), address: a.email })) }
      : {}),
    subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 998),
    text: input.text,
    headers: { "X-AQ-Draft": "1" },
    ...(input.inReplyTo && /^<[^\s<>]+>$/.test(input.inReplyTo)
      ? { inReplyTo: input.inReplyTo }
      : {}),
    ...(input.references?.length
      ? { references: input.references.filter((r) => /^<[^\s<>]+>$/.test(r)) }
      : {}),
    attachments: [
      {
        filename: DRAFT_STATE_FILENAME,
        content: JSON.stringify(input.state),
        contentType: "application/json",
        contentDisposition: "attachment" as const,
      },
      ...input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        contentDisposition: "attachment" as const,
      })),
    ],
  });
  return composer.compile().build();
}
