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
}
