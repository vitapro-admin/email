export type { MailGateway } from "./gateway.js";
export { InMemoryMailGateway } from "./in-memory.js";
export type * from "./types.js";
export { ImapMailGateway } from "./imap.js";
export type { ImapConfig } from "./imap.js";
export {
  OUTGOING_LIMITS,
  OutgoingMessageError,
  replyHeaders,
  validateOutgoing,
} from "./outgoing.js";
export type {
  InlineImage,
  MailSender,
  OutgoingAttachment,
  OutgoingErrorCode,
  OutgoingMessage,
  SentMessage,
} from "./outgoing.js";
export { SmtpMailSender, buildRawMessage } from "./smtp.js";
export type { SmtpConfig } from "./smtp.js";
export { DRAFT_STATE_FILENAME, buildDraftRaw } from "./draft.js";
export type { DraftInput } from "./draft.js";
