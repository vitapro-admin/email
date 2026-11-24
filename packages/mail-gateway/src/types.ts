/** Protocol-independent mail types. The rest of the app must only use these, never IMAP types. */

export interface Address {
  name?: string;
  email: string;
}

export interface FolderInfo {
  /** Full path on the server, e.g. "INBOX" or "INBOX/Archive". */
  path: string;
  name: string;
  total: number;
  unseen: number;
  /** Role of the folder when the server marks one (RFC 6154). */
  specialUse?: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";
}

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageSummary {
  uid: number;
  folder: string;
  subject: string;
  from: Address;
  date: Date;
  seen: boolean;
  hasAttachments: boolean;
}

export interface MessageDetail extends MessageSummary {
  to: Address[];
  cc: Address[];
  messageId: string;
  inReplyTo?: string;
  references: string[];
  text?: string;
  /** Raw HTML from the sender. UNTRUSTED: must be sanitized before display. */
  html?: string;
  attachments: AttachmentInfo[];
}

export interface ListMessagesOptions {
  /** Maximum number of messages, newest first. Default 50. */
  limit?: number;
  /** Return only messages with uid lower than this (for paging). */
  beforeUid?: number;
}

export interface AttachmentContent extends AttachmentInfo {
  content: Buffer;
}
