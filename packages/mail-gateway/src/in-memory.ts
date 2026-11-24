import { simpleParser } from "mailparser";
import type { MailGateway } from "./gateway.js";
import type {
  AttachmentContent,
  FolderInfo,
  ListMessagesOptions,
  MessageDetail,
  MessageSummary,
} from "./types.js";

/** Test double that also defines the behaviour every real gateway must reproduce. */
export class InMemoryMailGateway implements MailGateway {
  private readonly folders = new Map<string, MessageDetail[]>();

  constructor(seed: Record<string, MessageDetail[]> = {}) {
    for (const [path, messages] of Object.entries(seed)) {
      this.folders.set(path, [...messages]);
    }
  }

  listFolders(): Promise<FolderInfo[]> {
    const result = [...this.folders.entries()].map(([path, messages]) => ({
      path,
      name: path.split("/").at(-1) ?? path,
      total: messages.length,
      unseen: messages.filter((m) => !m.seen).length,
    }));
    return Promise.resolve(result);
  }

  listMessages(folder: string, options: ListMessagesOptions = {}): Promise<MessageSummary[]> {
    const { limit = 50, beforeUid } = options;
    const messages = this.folders.get(folder) ?? [];
    const result = messages
      .filter((m) => beforeUid === undefined || m.uid < beforeUid)
      .sort((a, b) => b.uid - a.uid)
      .slice(0, limit)
      .map(toSummary);
    return Promise.resolve(result);
  }

  getAttachment(): Promise<AttachmentContent | null> {
    // The in-memory double stores no attachment bodies.
    return Promise.resolve(null);
  }

  markSeen(folder: string, uid: number, seen: boolean): Promise<boolean> {
    const message = this.folders.get(folder)?.find((m) => m.uid === uid);
    if (!message) return Promise.resolve(false);
    message.seen = seen;
    return Promise.resolve(true);
  }

  async appendMessage(
    folder: string,
    raw: Buffer,
    flags: string[] = [],
  ): Promise<{ uid?: number }> {
    const parsed = await simpleParser(raw);
    const list = this.folders.get(folder) ?? [];
    const uid = list.reduce((max, m) => Math.max(max, m.uid), 0) + 1;
    const first = parsed.from?.value[0];
    const detail: MessageDetail = {
      uid,
      folder,
      subject: parsed.subject ?? "",
      from: { ...(first?.name ? { name: first.name } : {}), email: first?.address ?? "" },
      date: parsed.date ?? new Date(),
      seen: flags.includes("\\Seen"),
      hasAttachments: parsed.attachments.some((a) => a.contentDisposition === "attachment"),
      to: [],
      cc: [],
      messageId: parsed.messageId ?? "",
      references: [],
      attachments: [],
    };
    if (parsed.text) detail.text = parsed.text;
    if (parsed.html) detail.html = parsed.html;
    this.folders.set(folder, [...list, detail]);
    return { uid };
  }

  getMessage(folder: string, uid: number): Promise<MessageDetail | null> {
    const found = this.folders.get(folder)?.find((m) => m.uid === uid) ?? null;
    return Promise.resolve(found);
  }
}

function toSummary(m: MessageDetail): MessageSummary {
  return {
    uid: m.uid,
    folder: m.folder,
    subject: m.subject,
    from: m.from,
    date: m.date,
    seen: m.seen,
    hasAttachments: m.hasAttachments,
  };
}
