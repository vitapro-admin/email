/**
 * The API against a real test mailserver: real IMAP login, real attachment download, a real reply
 * that is delivered and copied to Sent. Skipped unless MAIL_TEST_IMAP_HOST is set.
 */
import { ImapMailGateway, SmtpMailSender } from "@aquapro/mail-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { FastifyInstance } from "fastify";

const host = process.env["MAIL_TEST_IMAP_HOST"];
const run = String(Date.now());

describe.skipIf(!host)("API with a real mailserver", () => {
  let app: FastifyInstance;
  let cookie = "";
  const call = (method: "GET" | "POST", url: string, body?: unknown) =>
    app.inject({
      method,
      url,
      cookies: { aq_session: cookie },
      headers: method === "POST" ? { "x-aq-client": "web" } : {},
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  beforeAll(async () => {
    // A customer writes to ivana, with an attachment and a hostile HTML body.
    const customer = new SmtpMailSender({
      host: host ?? "127.0.0.1",
      port: 3025,
      secure: false,
      requireTls: false,
      from: { name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" },
    });
    await customer.send({
      to: [{ email: "ivana@aquapro.test" }],
      subject: `Reklamácia ${run}`,
      text: "Dve fľaše majú zakalenú vodu.",
      html: '<p>Dve fľaše majú <b>zakalenú vodu</b>.</p><script>alert(1)</script><img src="http://tracker.example/p.gif" width="1" height="1">',
      attachments: [
        { filename: "foto.txt", content: Buffer.from("obsah fotky"), contentType: "text/plain" },
      ],
    });

    app = await buildApp({ config: loadConfig({ IMAP_HOST: host ?? "127.0.0.1" }) });
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { "x-aq-client": "web" },
      payload: { username: "ivana", password: "ivana" },
    });
    expect(res.statusCode).toBe(200);
    cookie = res.cookies.find((c) => c.name === "aq_session")?.value ?? "";
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a wrong password with a real mailserver", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { "x-aq-client": "web" },
      payload: { username: "ivana", password: "zle-heslo" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("reads the message, shows it safely and offers the attachment as a download", async () => {
    const list = (await call("GET", "/api/messages?folder=INBOX")).json() as {
      uid: number;
      subject: string;
    }[];
    const mine = list.find((m) => m.subject === `Reklamácia ${run}`);
    expect(mine).toBeDefined();

    const view = (await call("GET", `/api/message?folder=INBOX&uid=${mine?.uid}`)).json();
    expect(view.frame.document).toContain("zakalenú vodu");
    expect(view.frame.document).not.toMatch(/<script|tracker\.example/);
    expect(view.attachments).toEqual([
      { index: 0, filename: "foto.txt", contentType: "text/plain", size: 11 },
    ]);
    expect(view.seen).toBe(true);

    const file = await call("GET", `/api/attachment?folder=INBOX&uid=${mine?.uid}&index=0`);
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe("obsah fotky");
    expect(file.headers["content-type"]).toBe("application/octet-stream");
    expect(String(file.headers["content-disposition"])).toContain("attachment");
  });

  it("sends a reply that is delivered with the quote and logo, and kept in Sent", async () => {
    const list = (await call("GET", "/api/messages?folder=INBOX")).json() as {
      uid: number;
      subject: string;
    }[];
    const original = list.find((m) => m.subject === `Reklamácia ${run}`);

    const res = await call("POST", "/api/compose/send", {
      mode: "reply",
      folder: "INBOX",
      uid: original?.uid,
      to: "prijemca@aquapro.test",
      subject: `Re: Reklamácia ${run}`,
      doc: [{ type: "paragraph", content: [{ type: "text", text: "Výmenu zabezpečíme." }] }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().savedToSent).toBe(true);

    const recipient = new ImapMailGateway({
      host: host ?? "127.0.0.1",
      port: 3143,
      secure: false,
      user: "prijemca",
      password: "prijemca",
      allowInvalidCertificates: true,
    });
    const arrived = (await recipient.listMessages("INBOX")).find(
      (m) => m.subject === `Re: Reklamácia ${run}`,
    );
    expect(arrived).toBeDefined();
    const detail = await recipient.getMessage("INBOX", arrived?.uid ?? 0);
    expect(detail?.from.email).toBe("ivana@aquapro.test");
    expect(detail?.text).toContain("Výmenu zabezpečíme.");
    expect(detail?.text).toContain("> Dve fľaše majú zakalenú vodu.");
    expect(detail?.html).toContain("data:image/png;base64,");
    expect(detail?.inReplyTo).toMatch(/^<.+>$/);

    const sent = (await call("GET", "/api/messages?folder=Sent")).json() as {
      subject: string;
      seen: boolean;
    }[];
    expect(sent.find((m) => m.subject === `Re: Reklamácia ${run}`)?.seen).toBe(true);
  });
});
