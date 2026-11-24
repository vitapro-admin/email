import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { DRAFT_STATE_FILENAME, buildDraftRaw } from "./draft.js";

describe("buildDraftRaw", () => {
  const from = { name: "Ivana K.", email: "ivana@aquapro.test" };

  it("builds an incomplete draft (no recipient, no subject, no text) without failing", async () => {
    const raw = await buildDraftRaw({
      from,
      to: [],
      subject: "",
      text: "",
      state: { v: 1 },
      attachments: [],
    });
    const parsed = await simpleParser(raw);
    expect(parsed.from?.value[0]?.address).toBe("ivana@aquapro.test");
    expect(parsed.to).toBeUndefined();
    expect(raw.toString()).toMatch(/^X-AQ-Draft: 1/im);
  });

  it("keeps the editor state and the attachments, and ignores implausible recipients and bad headers", async () => {
    const state = {
      v: 1,
      doc: [{ type: "paragraph", content: [{ type: "text", text: "Ďakujem" }] }],
    };
    const raw = await buildDraftRaw({
      from,
      to: [{ email: "abc" }, { name: "Jana", email: "jana@klient.example" }],
      subject: "Predmet\r\nBcc: zlo@evil.example",
      text: "Ďakujem",
      inReplyTo: "<orig@klient.example>",
      references: ["<a@x>", "nie id"],
      state,
      attachments: [
        { filename: "foto.txt", content: Buffer.from("obsah"), contentType: "text/plain" },
      ],
    });
    const text = raw.toString();
    expect(text).not.toMatch(/^bcc:/im);
    const parsed = await simpleParser(raw);
    expect(parsed.to).toMatchObject({ value: [{ address: "jana@klient.example" }] });
    expect(parsed.subject).toBe("Predmet Bcc: zlo@evil.example");
    expect(parsed.inReplyTo).toBe("<orig@klient.example>");
    const names = parsed.attachments.map((a) => a.filename);
    expect(names).toEqual([DRAFT_STATE_FILENAME, "foto.txt"]);
    expect(JSON.parse(parsed.attachments[0]?.content.toString() ?? "{}")).toEqual(state);
  });
});
