import { ImapFlow } from "imapflow";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { AddressObject, Attachment } from "mailparser";
import type { MailGateway } from "./gateway.js";
import type {
  Address,
  AttachmentInfo,
  FolderInfo,
  ListMessagesOptions,
  MessageDetail,
  MessageSummary,
} from "./types.js";

export interface ImapConfig {
  host: string;
  port: number;
  /** true = TLS from the start (port 993). Use true in production. */
  secure: boolean;
  user: string;
  password: string;
  /** Only for local tests with self-signed certificates. Never disable in production. */
  allowInvalidCertificates?: boolean;
}

/**
 * IMAP implementation of MailGateway for one user's mailbox.
 *
 * Simple and stateless: one short-lived connection per call. A connection pool and
 * IDLE-based push come later; the interface does not change when they are added.
 */
export class ImapMailGateway implements MailGateway {
  constructor(private readonly config: ImapConfig) {}

  async listFolders(): Promise<FolderInfo[]> {
    return this.withClient(async (client) => {
      const folders = await client.list();
      const result: FolderInfo[] = [];
      for (const folder of folders) {
        if (folder.flags.has("\\Noselect")) continue;
        const status = await client.status(folder.path, { messages: true, unseen: true });
        const role = specialUseOf(folder.specialUse, folder.path);
        result.push({
          ...(role ? { specialUse: role } : {}),
          path: folder.path,
          name: folder.name,
          total: status ? (status.messages ?? 0) : 0,
          unseen: status ? (status.unseen ?? 0) : 0,
        });
      }
      return result;
    });
  }

  async listMessages(folder: string, options: ListMessagesOptions = {}): Promise<MessageSummary[]> {
    const { limit = 50, beforeUid } = options;
    return this.withClient(async (client) => {
      if (!(await folderExists(client, folder))) return [];
      const lock = await client.getMailboxLock(folder);
      try {
        const found = await client.search({ all: true }, { uid: true });
        const uids = (found || [])
          .filter((uid) => beforeUid === undefined || uid < beforeUid)
          .sort((a, b) => b - a)
          .slice(0, limit);
        if (uids.length === 0) return [];

        const summaries: MessageSummary[] = [];
        for await (const message of client.fetch(
          uids.join(","),
          { uid: true, envelope: true, flags: true, bodyStructure: true },
          { uid: true },
        )) {
          summaries.push(toSummary(folder, message));
        }
        return summaries.sort((a, b) => b.uid - a.uid);
      } finally {
        lock.release();
      }
    });
  }

  async appendMessage(
    folder: string,
    raw: Buffer,
    flags: string[] = [],
  ): Promise<{ uid?: number }> {
    return this.withClient(async (client) => {
      if (!(await folderExists(client, folder))) await client.mailboxCreate(folder);
      const result = await client.append(folder, raw, flags);
      if (!result) return {};
      return result.uid !== undefined ? { uid: result.uid } : {};
    });
  }

  async getMessage(folder: string, uid: number): Promise<MessageDetail | null> {
    return this.withClient(async (client) => {
      if (!(await folderExists(client, folder))) return null;
      const lock = await client.getMailboxLock(folder);
      try {
        // Fetching the source does not mark the message as read (peek).
        const message = await client.fetchOne(
          String(uid),
          { uid: true, flags: true, source: true },
          { uid: true },
        );
        if (!message || !message.source) return null;
        const parsed = await simpleParser(message.source);

        const detail: MessageDetail = {
          uid,
          folder,
          subject: parsed.subject ?? "",
          from: firstAddress(parsed.from) ?? { email: "" },
          date: parsed.date ?? new Date(0),
          seen: message.flags?.has("\\Seen") ?? false,
          hasAttachments: parsed.attachments.some(isRealAttachment),
          to: addresses(parsed.to),
          cc: addresses(parsed.cc),
          messageId: parsed.messageId ?? "",
          references: toArray(parsed.references),
          attachments: parsed.attachments.filter(isRealAttachment).map(toAttachmentInfo),
        };
        if (parsed.inReplyTo) detail.inReplyTo = parsed.inReplyTo;
        if (parsed.text) detail.text = parsed.text;
        if (parsed.html) detail.html = parsed.html;
        return detail;
      } finally {
        lock.release();
      }
    });
  }

  private async withClient<T>(action: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      tls: { rejectUnauthorized: !this.config.allowInvalidCertificates },
      logger: false,
    });
    await client.connect();
    try {
      return await action(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}

function specialUseOf(flag: string | undefined, path: string): FolderInfo["specialUse"] {
  switch (flag) {
    case "\\Sent":
      return "sent";
    case "\\Drafts":
      return "drafts";
    case "\\Trash":
      return "trash";
    case "\\Junk":
      return "junk";
    case "\\Archive":
      return "archive";
    default:
      return path.toUpperCase() === "INBOX" ? "inbox" : undefined;
  }
}

async function folderExists(client: ImapFlow, path: string): Promise<boolean> {
  const folders = await client.list();
  return folders.some((f) => f.path === path && !f.flags.has("\\Noselect"));
}

function toSummary(folder: string, message: FetchMessageObject): MessageSummary {
  const envelope = message.envelope;
  const from = envelope?.from?.[0];
  return {
    uid: message.uid,
    folder,
    subject: envelope?.subject ?? "",
    from: {
      ...(from?.name ? { name: from.name } : {}),
      email: from?.address ?? "",
    },
    date: envelope?.date ? new Date(envelope.date) : new Date(0),
    seen: message.flags?.has("\\Seen") ?? false,
    hasAttachments: message.bodyStructure ? structureHasAttachment(message.bodyStructure) : false,
  };
}

function structureHasAttachment(node: MessageStructureObject): boolean {
  if (node.disposition?.toLowerCase() === "attachment") return true;
  return (node.childNodes ?? []).some(structureHasAttachment);
}

function isRealAttachment(attachment: Attachment): boolean {
  return attachment.contentDisposition === "attachment" || !attachment.related;
}

function toAttachmentInfo(attachment: Attachment): AttachmentInfo {
  return {
    filename: attachment.filename ?? "priloha",
    contentType: attachment.contentType,
    size: attachment.size,
  };
}

function addresses(value: AddressObject | AddressObject[] | undefined): Address[] {
  if (!value) return [];
  const objects = Array.isArray(value) ? value : [value];
  return objects
    .flatMap((o) => o.value)
    .filter((a) => a.address)
    .map((a) => ({ ...(a.name ? { name: a.name } : {}), email: a.address ?? "" }));
}

function firstAddress(value: AddressObject | AddressObject[] | undefined): Address | undefined {
  return addresses(value)[0];
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
