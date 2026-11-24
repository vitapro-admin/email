/**
 * End-to-end test against a real test mailserver: render the email, send it over SMTP, read it back
 * over IMAP and store a copy in Sent. Skipped unless MAIL_TEST_IMAP_HOST is set (see imap.integration.test.ts).
 */
import { paragraph, textToDoc } from "@aquapro/editor-schema";
import { LOGO_CID, logoAttachment, renderEmail } from "@aquapro/email-render";
import { describe, expect, it } from "vitest";
import { ImapMailGateway } from "./imap.js";
import { replyHeaders } from "./outgoing.js";
import { SmtpMailSender } from "./smtp.js";

const host = process.env["MAIL_TEST_IMAP_HOST"];
const imapPort = Number(process.env["MAIL_TEST_IMAP_PORT"] ?? 3143);
const smtpPort = Number(process.env["MAIL_TEST_SMTP_PORT"] ?? 3025);
const run = String(Date.now());

describe.skipIf(!host)("SMTP sending (real server)", () => {
  const sender = new SmtpMailSender({
    host: host ?? "127.0.0.1",
    port: smtpPort,
    secure: false,
    requireTls: false,
    from: { name: "Ivana K.", email: "ivana@aquapro.test" },
  });
  const inbox = new ImapMailGateway({
    host: host ?? "127.0.0.1",
    port: imapPort,
    secure: false,
    user: "prijemca",
    password: "prijemca",
    allowInvalidCertificates: true,
  });
  const ivana = new ImapMailGateway({
    host: host ?? "127.0.0.1",
    port: imapPort,
    secure: false,
    user: "ivana",
    password: "ivana",
    allowInvalidCertificates: true,
  });

  it("sends a rendered reply that arrives with HTML, text, inline logo and threading headers", async () => {
    const subject = `Re: Reklamácia dodávky ${run}`;
    const rendered = await renderEmail({
      subject,
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        ...textToDoc("ďakujeme za správu, ozveme sa do 2 pracovných dní."),
      ],
      sender: { name: "Ivana K.", role: "Podpora obchodu", email: "ivana@aquapro.test" },
      company: { name: "AQUA PRO EUROPE", legalLine: "Modelový text päty." },
      logoUrl: `cid:${LOGO_CID}`,
    });
    const threading = replyHeaders({ messageId: `<orig-${run}@klient.example>`, references: [] });

    const sent = await sender.send({
      to: [{ name: "Test Príjemca", email: "prijemca@aquapro.test" }],
      bcc: [{ email: "podpora@aquapro.test" }],
      subject,
      html: rendered.html,
      text: rendered.text,
      inReplyTo: threading.inReplyTo,
      references: threading.references,
      inlineImages: [logoAttachment()],
    });
    expect(sent.accepted).toContain("prijemca@aquapro.test");
    expect(sent.rejected).toEqual([]);
    expect(sent.raw.toString()).not.toMatch(/^bcc:/im);

    const messages = await inbox.listMessages("INBOX");
    const arrived = messages.find((m) => m.subject === subject);
    expect(arrived).toBeDefined();
    expect(arrived?.from).toEqual({ name: "Ivana K.", email: "ivana@aquapro.test" });
    expect(arrived?.hasAttachments).toBe(false); // the logo is inline, not an attachment

    const detail = await inbox.getMessage("INBOX", arrived?.uid ?? 0);
    expect(detail?.text).toContain("ďakujeme za správu");
    // The inline logo arrives embedded, so it shows even where remote images are blocked.
    expect(detail?.html).toContain("data:image/png;base64,");
    expect(detail?.html).toContain("Dobrý deň, pani Horváthová,");
    expect(detail?.messageId).toBe(sent.messageId);
    expect(detail?.inReplyTo).toBe(`<orig-${run}@klient.example>`);
    expect(detail?.references).toEqual([`<orig-${run}@klient.example>`]);
    expect(detail?.cc).toEqual([]);
  });

  it("delivers to Bcc recipients without showing them to the others", async () => {
    const subject = `Skrytá kópia ${run}`;
    await sender.send({
      to: [{ email: "prijemca@aquapro.test" }],
      bcc: [{ email: "podpora@aquapro.test" }],
      subject,
      html: "<p>Test</p>",
      text: "Test",
    });
    const primary = (await inbox.listMessages("INBOX")).find((m) => m.subject === subject);
    expect(primary).toBeDefined();
    const detail = await inbox.getMessage("INBOX", primary?.uid ?? 0);
    expect(detail?.to).toEqual([{ email: "prijemca@aquapro.test" }]);
    expect(detail?.cc).toEqual([]);

    const podpora = new ImapMailGateway({
      host: host ?? "127.0.0.1",
      port: imapPort,
      secure: false,
      user: "podpora",
      password: "podpora",
      allowInvalidCertificates: true,
    });
    const received = (await podpora.listMessages("INBOX")).find((m) => m.subject === subject);
    expect(received).toBeDefined();
  });

  it("saves a copy in the Sent folder, marked as read", async () => {
    const subject = `Odoslané ${run}`;
    const sent = await sender.send({
      to: [{ email: "prijemca@aquapro.test" }],
      subject,
      html: "<p>Kópia</p>",
      text: "Kópia",
    });
    const saved = await ivana.appendMessage("Sent", sent.raw, ["\\Seen"]);
    expect(saved.uid).toBeGreaterThan(0);

    const folders = await ivana.listFolders();
    expect(folders.some((f) => f.path === "Sent")).toBe(true);
    const inSent = (await ivana.listMessages("Sent")).find((m) => m.subject === subject);
    expect(inSent?.seen).toBe(true);
    expect(inSent?.from.email).toBe("ivana@aquapro.test");
  });

  it("refuses an unsafe message before anything is sent", async () => {
    await expect(
      sender.send({
        to: [{ email: "prijemca@aquapro.test" }],
        subject: "Ahoj\r\nBcc: zlo@evil.example",
        html: "<p>x</p>",
        text: "x",
      }),
    ).rejects.toThrow(/predmet/i);
  });
});
