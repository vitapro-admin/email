import { describe, expect, it } from "vitest";
import { InMemoryMailGateway } from "./in-memory.js";
import type { MessageDetail } from "./types.js";

function message(uid: number, overrides: Partial<MessageDetail> = {}): MessageDetail {
  return {
    uid,
    folder: "INBOX",
    subject: `Predmet ${uid}`,
    from: { name: "Test Odosielateľ", email: "test@example.com" },
    date: new Date(2026, 10, uid),
    seen: false,
    hasAttachments: false,
    to: [{ email: "podpora@example.com" }],
    cc: [],
    messageId: `<${uid}@example.com>`,
    references: [],
    attachments: [],
    ...overrides,
  };
}

describe("InMemoryMailGateway", () => {
  const gateway = new InMemoryMailGateway({
    INBOX: [message(1), message(2, { seen: true }), message(3)],
    "INBOX/Archive": [message(10, { folder: "INBOX/Archive" })],
  });

  it("lists folders with counts", async () => {
    const folders = await gateway.listFolders();
    expect(folders).toContainEqual({ path: "INBOX", name: "INBOX", total: 3, unseen: 2 });
    expect(folders).toContainEqual({
      path: "INBOX/Archive",
      name: "Archive",
      total: 1,
      unseen: 1,
    });
  });

  it("lists messages newest first and respects the limit", async () => {
    const messages = await gateway.listMessages("INBOX", { limit: 2 });
    expect(messages.map((m) => m.uid)).toEqual([3, 2]);
  });

  it("pages with beforeUid", async () => {
    const messages = await gateway.listMessages("INBOX", { beforeUid: 3 });
    expect(messages.map((m) => m.uid)).toEqual([2, 1]);
  });

  it("returns an empty list for an unknown folder", async () => {
    expect(await gateway.listMessages("Neexistuje")).toEqual([]);
  });

  it("returns a message by uid and null when missing", async () => {
    expect((await gateway.getMessage("INBOX", 2))?.subject).toBe("Predmet 2");
    expect(await gateway.getMessage("INBOX", 999)).toBeNull();
  });
});

describe("InMemoryMailGateway: markSeen", () => {
  it("sets and clears the read flag and reports unknown messages", async () => {
    const gateway = new InMemoryMailGateway({ INBOX: [message(1)] });
    expect(await gateway.markSeen("INBOX", 1, true)).toBe(true);
    expect((await gateway.getMessage("INBOX", 1))?.seen).toBe(true);
    expect(await gateway.markSeen("INBOX", 1, false)).toBe(true);
    expect((await gateway.getMessage("INBOX", 1))?.seen).toBe(false);
    expect(await gateway.markSeen("INBOX", 99, true)).toBe(false);
  });
});

describe("InMemoryMailGateway: deleteMessage and attachments", () => {
  it("deletes a message and reports unknown ones", async () => {
    const gateway = new InMemoryMailGateway({ Drafts: [message(1), message(2)] });
    expect(await gateway.deleteMessage("Drafts", 1)).toBe(true);
    expect((await gateway.listMessages("Drafts")).map((m) => m.uid)).toEqual([2]);
    expect(await gateway.deleteMessage("Drafts", 1)).toBe(false);
    expect(await gateway.deleteMessage("Nic", 1)).toBe(false);
  });

  it("returns seeded attachment bodies", async () => {
    const gateway = new InMemoryMailGateway(
      {
        INBOX: [
          message(1, { attachments: [{ filename: "a.txt", contentType: "text/plain", size: 3 }] }),
        ],
      },
      { "INBOX/1": [Buffer.from("abc")] },
    );
    expect((await gateway.getAttachment("INBOX", 1, 0))?.content.toString()).toBe("abc");
    expect(await gateway.getAttachment("INBOX", 1, 1)).toBeNull();
  });
});
