/**
 * Integration tests against a real test mailserver (GreenMail).
 * Skipped unless MAIL_TEST_IMAP_HOST is set. Start the server with:
 *   docker compose -f infra/docker-compose.yml up -d
 * then run:  MAIL_TEST_IMAP_HOST=127.0.0.1 pnpm --filter @aquapro/mail-gateway test
 */
import nodemailer from "nodemailer";
import { beforeAll, describe, expect, it } from "vitest";
import { ImapMailGateway } from "./imap.js";

const host = process.env["MAIL_TEST_IMAP_HOST"];
const imapPort = Number(process.env["MAIL_TEST_IMAP_PORT"] ?? 3143);
const smtpPort = Number(process.env["MAIL_TEST_SMTP_PORT"] ?? 3025);

// A mailbox used only by this test file, so other data in the test server does not matter.
const RECIPIENT = "integracia@aquapro.test";
const run = String(Date.now());

describe.skipIf(!host)("ImapMailGateway (real server)", () => {
  const gateway = new ImapMailGateway({
    host: host ?? "127.0.0.1",
    port: imapPort,
    secure: false,
    user: "integracia",
    password: "integracia",
    allowInvalidCertificates: true,
  });

  beforeAll(async () => {
    const transport = nodemailer.createTransport({
      host: host ?? "127.0.0.1",
      port: smtpPort,
      secure: false,
    });
    await transport.sendMail({
      messageId: `<first-${run}@klient.example>`,
      from: '"Jana Horváthová" <jana@klient.example>',
      to: RECIPIENT,
      subject: `Žiadosť o zmenu dodacieho dňa ${run}`,
      text: "Dobrý deň, prosíme o presun na štvrtok.",
    });
    await transport.sendMail({
      messageId: `<second-${run}@klient.example>`,
      inReplyTo: `<first-${run}@klient.example>`,
      references: [`<first-${run}@klient.example>`],
      from: "jana@klient.example",
      to: RECIPIENT,
      cc: "kolega@klient.example",
      subject: `Re: Žiadosť o zmenu dodacieho dňa ${run}`,
      text: "Ďakujem.",
      html: "<p>Ďakujem.</p>",
      attachments: [{ filename: "list.txt", content: "obsah prílohy", contentType: "text/plain" }],
    });
  });

  it("lists the INBOX folder with counts", async () => {
    const folders = await gateway.listFolders();
    const inbox = folders.find((f) => f.path === "INBOX");
    expect(inbox).toBeDefined();
    expect(inbox?.total).toBeGreaterThanOrEqual(2);
    expect(inbox?.unseen).toBeGreaterThanOrEqual(2);
  });

  it("lists messages newest first with sender, subject and attachment flag", async () => {
    const messages = await gateway.listMessages("INBOX");
    const mine = messages.filter((m) => m.subject.endsWith(run));
    expect(mine).toHaveLength(2);
    const [newest, oldest] = mine;
    expect(newest?.subject).toBe(`Re: Žiadosť o zmenu dodacieho dňa ${run}`);
    expect(newest?.hasAttachments).toBe(true);
    expect(oldest?.hasAttachments).toBe(false);
    expect(oldest?.from).toEqual({ name: "Jana Horváthová", email: "jana@klient.example" });
    expect((newest?.uid ?? 0) > (oldest?.uid ?? 0)).toBe(true);
  });

  it("respects limit and beforeUid", async () => {
    const all = await gateway.listMessages("INBOX");
    const limited = await gateway.listMessages("INBOX", { limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.uid).toBe(all[0]?.uid);
    const older = await gateway.listMessages("INBOX", { beforeUid: all[0]?.uid ?? 0 });
    expect(older.every((m) => m.uid < (all[0]?.uid ?? 0))).toBe(true);
  });

  it("returns an empty list for an unknown folder", async () => {
    expect(await gateway.listMessages("Neexistuje")).toEqual([]);
  });

  it("reads a full message with threading headers, html and attachments", async () => {
    const messages = await gateway.listMessages("INBOX");
    const reply = messages.find((m) => m.subject.startsWith("Re:") && m.subject.endsWith(run));
    expect(reply).toBeDefined();
    const detail = await gateway.getMessage("INBOX", reply?.uid ?? 0);
    expect(detail?.messageId).toBe(`<second-${run}@klient.example>`);
    expect(detail?.inReplyTo).toBe(`<first-${run}@klient.example>`);
    expect(detail?.references).toEqual([`<first-${run}@klient.example>`]);
    expect(detail?.to).toEqual([{ email: RECIPIENT }]);
    expect(detail?.cc).toEqual([{ email: "kolega@klient.example" }]);
    expect(detail?.html).toContain("Ďakujem");
    expect(detail?.attachments).toEqual([
      { filename: "list.txt", contentType: "text/plain", size: 14 },
    ]);
  });

  it("does not mark a message as read when it is opened", async () => {
    const messages = await gateway.listMessages("INBOX");
    const first = messages.find((m) => m.subject.endsWith(run));
    await gateway.getMessage("INBOX", first?.uid ?? 0);
    const after = await gateway.listMessages("INBOX");
    expect(after.find((m) => m.uid === first?.uid)?.seen).toBe(false);
  });

  it("returns null for a missing message or folder", async () => {
    expect(await gateway.getMessage("INBOX", 999999)).toBeNull();
    expect(await gateway.getMessage("Neexistuje", 1)).toBeNull();
  });
});
