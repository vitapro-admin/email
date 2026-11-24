import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { OutgoingMessageError, replyHeaders, validateOutgoing } from "./outgoing.js";
import type { OutgoingMessage } from "./outgoing.js";
import { buildRawMessage } from "./smtp.js";

const from = { name: "Ivana K.", email: "ivana.k@aquapro.test" };
const logo = {
  cid: "aquapro-logo",
  filename: "logo.png",
  content: Buffer.from("PNG"),
  contentType: "image/png",
};

function message(overrides: Partial<OutgoingMessage> = {}): OutgoingMessage {
  return {
    to: [{ name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" }],
    subject: "Re: Reklamácia dodávky: zakalená voda",
    html: '<p>Ďakujeme za správu.</p><img src="cid:aquapro-logo">',
    text: "Ďakujeme za správu.",
    ...overrides,
  };
}

describe("validateOutgoing", () => {
  it("accepts a normal message", () => {
    expect(() => validateOutgoing(message())).not.toThrow();
  });

  it.each([
    ["no recipients", { to: [] }, "no-recipients"],
    ["invalid address", { to: [{ email: "nie-je-adresa" }] }, "invalid-address"],
    ["address with injected recipient", { to: [{ email: "a@b.sk, c@d.sk" }] }, "invalid-address"],
    [
      "header injection in subject",
      { subject: "Ahoj\r\nBcc: zlo@evil.example" },
      "invalid-subject",
    ],
    [
      "header injection in name",
      { to: [{ name: "X\r\nBcc: zlo@evil.example", email: "a@b.sk" }] },
      "invalid-address",
    ],
    ["bad In-Reply-To", { inReplyTo: "<a@b>\r\nBcc: x@y.sk" }, "invalid-header"],
    ["bad References", { references: ["nie id"] }, "invalid-header"],
    ["empty body", { html: " ", text: "x" }, "empty-body"],
    ["empty text part", { html: "<p>x</p>", text: "" }, "empty-body"],
  ] as const)("rejects %s", (_name, overrides, code) => {
    try {
      validateOutgoing(message(overrides as Partial<OutgoingMessage>));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OutgoingMessageError);
      expect((error as OutgoingMessageError).code).toBe(code);
    }
  });

  it("limits recipients and attachment size", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ email: `u${i}@x.sk` }));
    expect(() => validateOutgoing(message({ to: many }))).toThrow(/Príliš veľa/);
    const big = {
      filename: "a.bin",
      content: Buffer.alloc(21 * 1024 * 1024),
      contentType: "application/octet-stream",
    };
    expect(() => validateOutgoing(message({ attachments: [big] }))).toThrow(/príliš veľké/);
  });
});

describe("replyHeaders", () => {
  it("answers the original and extends the references", () => {
    expect(replyHeaders({ messageId: "<c@x>", references: ["<a@x>", "<b@x>"] })).toEqual({
      inReplyTo: "<c@x>",
      references: ["<a@x>", "<b@x>", "<c@x>"],
    });
  });

  it("keeps only the last 20 references", () => {
    const refs = Array.from({ length: 30 }, (_, i) => `<r${i}@x>`);
    const out = replyHeaders({ messageId: "<last@x>", references: refs });
    expect(out.references).toHaveLength(20);
    expect(out.references.at(-1)).toBe("<last@x>");
  });

  it("ignores malformed ids", () => {
    expect(replyHeaders({ messageId: "<ok@x>", references: ["zle", "<a@x>"] }).references).toEqual([
      "<a@x>",
      "<ok@x>",
    ]);
  });
});

describe("buildRawMessage", () => {
  it("builds HTML + text alternatives with the logo inline and correct threading headers", async () => {
    const { raw, messageId } = await buildRawMessage(
      from,
      message({
        inReplyTo: "<first@klient.example>",
        references: ["<first@klient.example>"],
        inlineImages: [logo],
      }),
    );
    const parsed = await simpleParser(raw);
    expect(parsed.messageId).toBe(messageId);
    expect(parsed.subject).toBe("Re: Reklamácia dodávky: zakalená voda");
    expect(parsed.from?.value[0]).toMatchObject({
      name: "Ivana K.",
      address: "ivana.k@aquapro.test",
    });
    expect(parsed.to).toMatchObject({ value: [{ name: "Jana Horváthová" }] });
    expect(parsed.inReplyTo).toBe("<first@klient.example>");
    expect([parsed.references].flat()).toEqual(["<first@klient.example>"]);
    expect(parsed.text).toContain("Ďakujeme za správu.");
    // The raw message references the logo by cid; the parser embeds it as a data: URI for display.
    expect(raw.toString()).toContain("cid:aquapro-logo");
    expect(parsed.html).toContain("data:image/png;base64,");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      cid: "aquapro-logo",
      related: true,
      contentDisposition: "inline",
    });
    expect(raw.toString()).toMatch(/multipart\/alternative/);
  });

  it("never writes Bcc into the message", async () => {
    const { raw } = await buildRawMessage(
      from,
      message({
        bcc: [{ email: "tajna.kopia@aquapro.test" }],
        cc: [{ email: "kopia@aquapro.test" }],
      }),
    );
    const text = raw.toString();
    expect(text).not.toMatch(/^bcc:/im);
    expect(text).not.toContain("tajna.kopia");
    expect(text).toMatch(/^cc:/im);
  });

  it("always uses the configured sender, whatever the message tries", async () => {
    const forged = { ...message(), from: { email: "riaditel@aquapro.test" } } as OutgoingMessage;
    const { raw } = await buildRawMessage(from, forged);
    const parsed = await simpleParser(raw);
    expect(parsed.from?.value[0]?.address).toBe("ivana.k@aquapro.test");
    expect(raw.toString()).not.toContain("riaditel@");
  });

  it("strips paths from attachment file names", async () => {
    const { raw } = await buildRawMessage(
      from,
      message({
        attachments: [
          {
            filename: "../../etc/passwd.txt",
            content: Buffer.from("x"),
            contentType: "text/plain",
          },
        ],
      }),
    );
    const parsed = await simpleParser(raw);
    expect(parsed.attachments[0]?.filename).toBe("passwd.txt");
  });

  it("refuses to build an unsafe message", async () => {
    await expect(
      buildRawMessage(from, message({ subject: "a\nBcc: x@y.sk" })),
    ).rejects.toBeInstanceOf(OutgoingMessageError);
  });
});
