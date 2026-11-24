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
  private readonly attachmentData = new Map<string, Buffer[]>();

  /**
   * @param seed messages per folder
   * @param attachments attachment bodies per message, keyed "FOLDER/uid", in the order of MessageDetail.attachments
   */
  constructor(
    seed: Record<string, MessageDetail[]> = {},
    attachments: Record<string, Buffer[]> = {},
  ) {
    for (const [key, bodies] of Object.entries(attachments)) this.attachmentData.set(key, bodies);
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

  getAttachment(folder: string, uid: number, index: number): Promise<AttachmentContent | null> {
    const info = this.folders.get(folder)?.find((m) => m.uid === uid)?.attachments[index];
    const content = this.attachmentData.get(`${folder}/${uid}`)?.[index];
    return Promise.resolve(info && content ? { ...info, content } : null);
  }

  deleteMessage(folder: string, uid: number): Promise<boolean> {
    const list = this.folders.get(folder);
    if (!list || !list.some((m) => m.uid === uid)) return Promise.resolve(false);
    this.folders.set(
      folder,
      list.filter((m) => m.uid !== uid),
    );
    return Promise.resolve(true);
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
    const people = (value: typeof parsed.to) =>
      (Array.isArray(value) ? value : value ? [value] : [])
        .flatMap((o) => o.value)
        .filter((a) => a.address)
        .map((a) => ({ ...(a.name ? { name: a.name } : {}), email: a.address ?? "" }));
    const real = parsed.attachments.filter(
      (a) => a.contentDisposition === "attachment" || !a.related,
    );
    const detail: MessageDetail = {
      uid,
      folder,
      subject: parsed.subject ?? "",
      from: { ...(first?.name ? { name: first.name } : {}), email: first?.address ?? "" },
      date: parsed.date ?? new Date(),
      seen: flags.includes("\\Seen"),
      hasAttachments: real.length > 0,
      to: people(parsed.to),
      cc: people(parsed.cc),
      messageId: parsed.messageId ?? "",
      references: Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? [parsed.references]
          : [],
      attachments: real.map((a) => ({
        filename: a.filename ?? "priloha",
        contentType: a.contentType,
        size: a.size,
      })),
    };
    if (parsed.inReplyTo) detail.inReplyTo = parsed.inReplyTo;
    if (parsed.text) detail.text = parsed.text;
    if (parsed.html) detail.html = parsed.html;
    this.attachmentData.set(
      `${folder}/${uid}`,
      real.map((a) => a.content),
    );
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
