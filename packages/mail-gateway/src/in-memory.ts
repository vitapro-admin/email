import type { MailGateway } from "./gateway.js";
import type { FolderInfo, ListMessagesOptions, MessageDetail, MessageSummary } from "./types.js";

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
