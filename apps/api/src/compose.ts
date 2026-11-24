import { sanitizeDoc } from "@aquapro/editor-schema";
import type { Doc } from "@aquapro/editor-schema";
import {
  LOGO_CID,
  logoAttachment,
  prefixSubject,
  quoteForForward,
  quoteForReply,
  renderEmail,
} from "@aquapro/email-render";
import type { CompanyInfo, Quote, RenderedEmail, Sender } from "@aquapro/email-render";
import { replyHeaders } from "@aquapro/mail-gateway";
import type { Address, MessageDetail, OutgoingMessage } from "@aquapro/mail-gateway";
import { sameAddress } from "./address.js";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export class ComposeError extends Error {
  constructor(
    readonly code: "empty-body" | "original-required",
    message: string,
  ) {
    super(message);
    this.name = "ComposeError";
  }
}

const formatAddress = (a: Address): string => (a.name ? `${a.name} <${a.email}>` : a.email);

/** Defaults the editor starts with for a reply, reply-all or forward. */
export function prepareCompose(
  mode: ComposeMode,
  original: MessageDetail | undefined,
  selfEmail: string,
): { to: string; cc: string; subject: string } {
  if (mode === "new") return { to: "", cc: "", subject: "" };
  if (!original) throw new ComposeError("original-required", "Chýba pôvodná správa.");
  if (mode === "forward") {
    return { to: "", cc: "", subject: prefixSubject(original.subject, "forward") };
  }
  const to = [original.from];
  const cc: Address[] = [];
  if (mode === "replyAll") {
    const others = [...original.to, ...original.cc].filter((a) => !sameAddress(a.email, selfEmail));
    for (const a of others) {
      if (![...to, ...cc].some((x) => sameAddress(x.email, a.email))) cc.push(a);
    }
  }
  return {
    to: to.map(formatAddress).join(", "),
    cc: cc.map(formatAddress).join(", "),
    subject: prefixSubject(original.subject, "reply"),
  };
}

/** The server decides the final subject: exactly one Re:/Fwd: prefix, never piled up. */
export function finalSubject(mode: ComposeMode, typed: string, original?: MessageDetail): string {
  const subject = typed.trim();
  if (mode === "reply" || mode === "replyAll") {
    return prefixSubject(subject || original?.subject || "", "reply");
  }
  if (mode === "forward") return prefixSubject(subject || original?.subject || "", "forward");
  return subject || "(bez predmetu)";
}

export interface RenderComposeInput {
  mode: ComposeMode;
  original: MessageDetail | undefined;
  subject: string;
  /** UNTRUSTED document from the browser. It is re-validated here. */
  doc: unknown;
  sender: Sender;
  company: CompanyInfo;
  /** "cid" for sending, "data" to show a preview in the browser. */
  logo: "cid" | "data";
}

export interface RenderedCompose {
  subject: string;
  body: Doc;
  rendered: RenderedEmail;
  quote: Quote | undefined;
}

export async function renderCompose(input: RenderComposeInput): Promise<RenderedCompose> {
  if (input.mode !== "new" && !input.original) {
    throw new ComposeError("original-required", "Chýba pôvodná správa.");
  }
  const body = sanitizeDoc(input.doc);
  if (body.length === 0 && input.mode !== "forward") {
    throw new ComposeError("empty-body", "Napíš text správy.");
  }
  const subject = finalSubject(input.mode, input.subject, input.original);
  const quote =
    input.original === undefined
      ? undefined
      : input.mode === "forward"
        ? quoteForForward(input.original)
        : input.mode === "new"
          ? undefined
          : quoteForReply(input.original);

  const logo = logoAttachment();
  const logoUrl =
    input.logo === "cid"
      ? `cid:${LOGO_CID}`
      : `data:${logo.contentType};base64,${logo.content.toString("base64")}`;

  const rendered = await renderEmail({
    subject,
    body,
    sender: input.sender,
    company: input.company,
    logoUrl,
    ...(quote ? { quote } : {}),
  });
  return { subject, body, rendered, quote };
}

export function toOutgoing(
  input: RenderComposeInput,
  rendered: RenderedCompose,
  recipients: { to: Address[]; cc: Address[]; bcc: Address[] },
): OutgoingMessage {
  const threading =
    input.original && input.mode !== "new" && input.mode !== "forward"
      ? replyHeaders({
          messageId: input.original.messageId,
          references: input.original.references,
        })
      : undefined;
  return {
    to: recipients.to,
    cc: recipients.cc,
    bcc: recipients.bcc,
    subject: rendered.subject,
    html: rendered.rendered.html,
    text: rendered.rendered.text,
    inlineImages: [logoAttachment()],
    ...(threading ? { inReplyTo: threading.inReplyTo, references: threading.references } : {}),
  };
}
