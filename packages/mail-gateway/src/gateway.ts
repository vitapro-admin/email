import type { FolderInfo, ListMessagesOptions, MessageDetail, MessageSummary } from "./types.js";

/**
 * Read access to one user's mailbox. Implementations: IMAP (production, later JMAP),
 * in-memory (tests). Sending is added in a later step.
 */
export interface MailGateway {
  listFolders(): Promise<FolderInfo[]>;
  listMessages(folder: string, options?: ListMessagesOptions): Promise<MessageSummary[]>;
  /** Returns null when the message does not exist. */
  getMessage(folder: string, uid: number): Promise<MessageDetail | null>;
  /** Stores a complete message (RFC 822) in a folder, creating the folder if needed. Used for Sent. */
  appendMessage(folder: string, raw: Buffer, flags?: string[]): Promise<{ uid?: number }>;
}
