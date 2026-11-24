import { simpleParser } from "mailparser";
import { buildRawMessage, InMemoryMailGateway } from "@aquapro/mail-gateway";
import type { MailSender, MessageDetail, OutgoingMessage } from "@aquapro/mail-gateway";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { parseAddressList } from "./address.js";
import { AttemptLimiter } from "./rate-limit.js";

function seedMessage(uid: number, overrides: Partial<MessageDetail> = {}): MessageDetail {
  return {
    uid,
    folder: "INBOX",
    subject: "Reklamácia dodávky",
    from: { name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" },
    date: new Date("2026-11-19T06:48:00Z"),
    seen: false,
    hasAttachments: false,
    to: [{ email: "ivana@aquapro.test" }, { email: "marek@aquapro.test" }],
    cc: [{ email: "kolega@hotelpanorama.example" }],
    messageId: `<orig-${uid}@hotelpanorama.example>`,
    references: ["<earlier@hotelpanorama.example>"],
    text: "Dobrý deň,\n\nzakalená voda.",
    attachments: [],
    ...overrides,
  };
}

interface Harness {
  app: FastifyInstance;
  gateway: InMemoryMailGateway;
  sent: { message: OutgoingMessage; raw: Buffer }[];
  clock: { now: number };
  login: () => Promise<string>;
  call: (
    method: "GET" | "POST",
    url: string,
    options?: { cookie?: string; body?: unknown; headers?: Record<string, string> },
  ) => Promise<LightMyRequestResponse>;
}

async function harness(): Promise<Harness> {
  const gateway = new InMemoryMailGateway({
    INBOX: [
      seedMessage(1),
      seedMessage(2, {
        subject: "Re: Re: Dopyt",
        html: '<p>Ahoj</p><script>alert(1)</script><img src="https://tracker.example/p.gif" width="1" height="1"><img src="https://ok.example/a.png" width="300"><a href="https://evil.example">https://www.mojabanka.sk</a>',
      }),
    ],
  });
  const sent: Harness["sent"] = [];
  const clock = { now: 1_000_000 };
  const sender: MailSender = {
    async send(message) {
      const { raw, messageId } = await buildRawMessage(
        { name: "Ivana", email: "ivana@aquapro.test" },
        message,
      );
      sent.push({ message, raw });
      return { messageId, raw, accepted: message.to.map((a) => a.email), rejected: [] };
    },
  };
  const app = await buildApp({
    config: loadConfig({}),
    createGateway: () => gateway,
    createSender: () => sender,
    authenticate: async (username, password) => username === "ivana" && password === "tajne",
    now: () => clock.now,
  });
  const call: Harness["call"] = (method, url, options = {}) =>
    app.inject({
      method,
      url,
      ...(options.cookie ? { cookies: { aq_session: options.cookie } } : {}),
      headers: { ...(method === "POST" ? { "x-aq-client": "web" } : {}), ...options.headers },
      ...(options.body !== undefined ? { payload: options.body as object } : {}),
    });
  const login = async () => {
    const res = await call("POST", "/api/login", {
      body: { username: "ivana", password: "tajne" },
    });
    return res.cookies.find((c) => c.name === "aq_session")?.value ?? "";
  };
  return { app, gateway, sent, clock, login, call };
}

describe("API", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(async () => {
    await h.app.close();
  });

  describe("login and sessions", () => {
    it("logs in, sets a strict httpOnly cookie and returns the profile", async () => {
      const res = await h.call("POST", "/api/login", {
        body: { username: "ivana", password: "tajne" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ name: "Ivana", email: "ivana@aquapro.test" });
      const cookie = res.cookies.find((c) => c.name === "aq_session");
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
      expect(cookie?.value.length).toBeGreaterThan(30);
      expect(JSON.stringify(res.json())).not.toContain("tajne");
    });

    it("rejects wrong credentials without revealing which part was wrong", async () => {
      const res = await h.call("POST", "/api/login", {
        body: { username: "ivana", password: "zle" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("bad-credentials");
      expect(res.cookies).toHaveLength(0);
    });

    it("rejects malformed login input", async () => {
      expect((await h.call("POST", "/api/login", { body: { username: "" } })).statusCode).toBe(400);
    });

    it("limits repeated login attempts", async () => {
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) {
        codes.push(
          (await h.call("POST", "/api/login", { body: { username: "ivana", password: "zle" } }))
            .statusCode,
        );
      }
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(codes.slice(5)).toEqual([429, 429]);
    });

    it("requires a session for everything else", async () => {
      for (const url of [
        "/api/folders",
        "/api/messages?folder=INBOX",
        "/api/me",
        "/api/message?folder=INBOX&uid=1",
      ]) {
        expect((await h.call("GET", url)).statusCode, url).toBe(401);
      }
    });

    it("expires an idle session", async () => {
      const cookie = await h.login();
      expect((await h.call("GET", "/api/me", { cookie })).statusCode).toBe(200);
      h.clock.now += 31 * 60_000;
      expect((await h.call("GET", "/api/me", { cookie })).statusCode).toBe(401);
    });

    it("keeps an active session alive but still ends it after the maximum age", async () => {
      const cookie = await h.login();
      for (let i = 0; i < 25; i++) {
        h.clock.now += 29 * 60_000;
        if (h.clock.now - 1_000_000 > 12 * 3_600_000) break;
        expect((await h.call("GET", "/api/me", { cookie })).statusCode).toBe(200);
      }
      expect((await h.call("GET", "/api/me", { cookie })).statusCode).toBe(401);
    });

    it("logs out", async () => {
      const cookie = await h.login();
      expect((await h.call("POST", "/api/logout", { cookie })).statusCode).toBe(200);
      expect((await h.call("GET", "/api/me", { cookie })).statusCode).toBe(401);
    });
  });

  describe("request protection", () => {
    it("refuses state-changing calls without the web client header", async () => {
      const cookie = await h.login();
      const res = await h.app.inject({
        method: "POST",
        url: "/api/logout",
        cookies: { aq_session: cookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it("refuses state-changing calls from another origin", async () => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/logout", {
        cookie,
        headers: { origin: "https://evil.example" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("accepts the Vite dev server origin in development and still blocks other origins", async () => {
      const login = (origin: string) =>
        h.call("POST", "/api/login", {
          body: { username: "ivana", password: "tajne" },
          headers: { origin, host: "127.0.0.1:3000" },
        });
      expect((await login("http://localhost:5173")).statusCode).toBe(200);
      expect((await login("http://127.0.0.1:5173")).statusCode).toBe(200);
      expect((await login("https://evil.example")).statusCode).toBe(403);
    });

    it("sets security headers", async () => {
      const res = await h.call("GET", "/api/me");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(String(res.headers["content-security-policy"])).toContain("object-src 'none'");
    });
  });

  describe("reading mail", () => {
    it("lists folders and messages", async () => {
      const cookie = await h.login();
      const folders = (await h.call("GET", "/api/folders", { cookie })).json();
      expect(folders[0]).toMatchObject({ path: "INBOX", total: 2 });
      const list = (await h.call("GET", "/api/messages?folder=INBOX&limit=1", { cookie })).json();
      expect(list).toHaveLength(1);
      expect(list[0].uid).toBe(2);
    });

    it("returns a sanitized, sandboxed view and marks the message as read", async () => {
      const cookie = await h.login();
      const res = await h.call("GET", "/api/message?folder=INBOX&uid=2", { cookie });
      const view = res.json();
      expect(view.frame.sandbox).toBe("allow-popups allow-popups-to-escape-sandbox");
      expect(view.frame.document).toContain("Ahoj");
      expect(view.frame.document).not.toMatch(/<script|tracker\.example|ok\.example/i);
      expect(view.frame.document).toContain("default-src 'none'");
      expect(view.safety).toMatchObject({
        blockedRemoteImages: 2,
        trackingPixels: 1,
        suspiciousLinks: 1,
      });
      expect(view.seen).toBe(true);
      expect((await h.gateway.getMessage("INBOX", 2))?.seen).toBe(true);
    });

    it("shows remote images only when asked, never tracking pixels", async () => {
      const cookie = await h.login();
      const view = (
        await h.call("GET", "/api/message?folder=INBOX&uid=2&images=1", { cookie })
      ).json();
      expect(view.frame.document).toContain("https://ok.example/a.png");
      expect(view.frame.document).not.toContain("tracker.example");
      expect(view.frame.document).toContain("img-src data: https:;");
    });

    it("renders plain-text messages safely", async () => {
      const cookie = await h.login();
      const view = (await h.call("GET", "/api/message?folder=INBOX&uid=1", { cookie })).json();
      expect(view.frame.document).toContain("zakalená voda");
    });

    it("answers 404 for a missing message and 400 for bad input", async () => {
      const cookie = await h.login();
      expect((await h.call("GET", "/api/message?folder=INBOX&uid=99", { cookie })).statusCode).toBe(
        404,
      );
      expect(
        (await h.call("GET", "/api/message?folder=INBOX&uid=abc", { cookie })).statusCode,
      ).toBe(400);
      expect(
        (await h.call("GET", "/api/attachment?folder=INBOX&uid=1&index=0", { cookie })).statusCode,
      ).toBe(404);
    });
  });

  describe("compose: prepare", () => {
    it("prepares a reply", async () => {
      const cookie = await h.login();
      const res = await h.call("GET", "/api/compose/prepare?mode=reply&folder=INBOX&uid=1", {
        cookie,
      });
      expect(res.json()).toEqual({
        to: "Jana Horváthová <j.horvathova@hotelpanorama.example>",
        cc: "",
        subject: "Re: Reklamácia dodávky",
      });
    });

    it("prepares reply-all without the user and without duplicates", async () => {
      const cookie = await h.login();
      const res = await h.call("GET", "/api/compose/prepare?mode=replyAll&folder=INBOX&uid=1", {
        cookie,
      });
      expect(res.json().cc).toBe("marek@aquapro.test, kolega@hotelpanorama.example");
    });

    it("prepares a forward with an Fwd: subject and no recipients", async () => {
      const cookie = await h.login();
      const res = await h.call("GET", "/api/compose/prepare?mode=forward&folder=INBOX&uid=2", {
        cookie,
      });
      expect(res.json()).toEqual({ to: "", cc: "", subject: "Fwd: Dopyt" });
    });
  });

  describe("compose: preview and send", () => {
    const doc = [{ type: "paragraph", content: [{ type: "text", text: "Ďakujeme, ozveme sa." }] }];

    it("previews the real email with the quote, signature and an embedded logo", async () => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/compose/preview", {
        cookie,
        body: {
          mode: "reply",
          folder: "INBOX",
          uid: 1,
          to: "j@x.sk",
          subject: "Re: Reklamácia dodávky",
          doc,
        },
      });
      expect(res.statusCode).toBe(200);
      const { html, subject } = res.json();
      expect(subject).toBe("Re: Reklamácia dodávky");
      expect(html).toContain("Ďakujeme, ozveme sa.");
      expect(html).toContain("zakalená voda");
      expect(html).toContain("Ivana");
      expect(html).toContain("data:image/png;base64,");
      expect(html).not.toContain("cid:");
    });

    it("sends a reply: forced sender, one Re: prefix, threading, quote, logo, saved to Sent", async () => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/compose/send", {
        cookie,
        body: {
          mode: "reply",
          folder: "INBOX",
          uid: 1,
          to: "Jana <j.horvathova@hotelpanorama.example>",
          cc: "kopia@aquapro.test",
          bcc: "tajna@aquapro.test",
          subject: "RE: Re: Reklamácia dodávky",
          doc,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().savedToSent).toBe(true);

      const { message, raw } = h.sent[0] ?? (expect.unreachable("nothing sent") as never);
      expect(message.subject).toBe("Re: Reklamácia dodávky");
      expect(message.to).toEqual([{ name: "Jana", email: "j.horvathova@hotelpanorama.example" }]);
      expect(message.bcc).toEqual([{ email: "tajna@aquapro.test" }]);
      expect(message.inReplyTo).toBe("<orig-1@hotelpanorama.example>");
      expect(message.references).toEqual([
        "<earlier@hotelpanorama.example>",
        "<orig-1@hotelpanorama.example>",
      ]);
      expect(message.inlineImages?.[0]?.cid).toBe("aquapro-logo");
      expect(message.html).toContain("cid:aquapro-logo");
      expect(message.html).toContain("zakalená voda");
      expect(raw.toString()).not.toMatch(/^bcc:/im);
      const parsed = await simpleParser(raw);
      expect(parsed.from?.value[0]?.address).toBe("ivana@aquapro.test");

      const saved = await h.gateway.listMessages("Sent");
      expect(saved).toHaveLength(1);
      expect(saved[0]?.seen).toBe(true);
    });

    it("cleans a hostile document sent straight to the API: the design cannot be bypassed", async () => {
      const cookie = await h.login();
      await h.call("POST", "/api/compose/send", {
        cookie,
        body: {
          mode: "new",
          to: "a@b.sk",
          subject: "Test",
          doc: [
            { type: "script", content: [{ type: "text", text: "alert(1)" }] },
            {
              type: "paragraph",
              style: "font-family:Comic Sans MS;color:red;font-size:40px",
              content: [
                {
                  type: "text",
                  text: "Text",
                  marks: ["bold", "underline"],
                  style: "color:red",
                  href: "javascript:alert(1)",
                },
                { type: "image", src: "http://tracker.example/x.gif" },
              ],
            },
          ],
        },
      });
      const html = h.sent[0]?.message.html ?? "";
      expect(html).toContain("Text");
      expect(html).not.toMatch(
        /Comic Sans|color:red|font-size:40px|alert\(1\)|javascript:|tracker\.example|underline/,
      );
    });

    it("lets a forward go out without extra text", async () => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/compose/send", {
        cookie,
        body: {
          mode: "forward",
          folder: "INBOX",
          uid: 1,
          to: "kolega@aquapro.test",
          subject: "Fwd: Reklamácia dodávky",
          doc: [],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(h.sent[0]?.message.html).toContain("Preposlaná správa");
      expect(h.sent[0]?.message.inReplyTo).toBeUndefined();
    });

    it.each([
      ["an empty reply", { mode: "new", to: "a@b.sk", subject: "x", doc: [] }, "empty-body"],
      ["a bad recipient", { mode: "new", to: "nie-adresa", subject: "x", doc }, "invalid-address"],
      ["no recipient", { mode: "new", to: "", subject: "x", doc }, "no-recipients"],
      [
        "header injection in subject",
        { mode: "new", to: "a@b.sk", subject: "x\r\nBcc: zlo@evil.sk", doc },
        "invalid-subject",
      ],
      [
        "a reply without original",
        { mode: "reply", to: "a@b.sk", subject: "x", doc },
        "original-required",
      ],
    ])("rejects %s", async (_name, body, code) => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/compose/send", { cookie, body });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe(code);
      expect(h.sent).toHaveLength(0);
    });

    it("answers 404 when the message being answered does not exist", async () => {
      const cookie = await h.login();
      const res = await h.call("POST", "/api/compose/send", {
        cookie,
        body: { mode: "reply", folder: "INBOX", uid: 999, to: "a@b.sk", subject: "x", doc },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

describe("config", () => {
  it("refuses an insecure production setup", () => {
    expect(() => loadConfig({ NODE_ENV: "production", IMAP_SECURE: "false" })).toThrow(/produkciu/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", MAIL_ALLOW_INVALID_CERTIFICATES: "true" }),
    ).toThrow(/MAIL_ALLOW_INVALID_CERTIFICATES/);
  });

  it("trusts the Vite dev server only outside production", () => {
    expect(loadConfig({}).allowedOrigins).toContain("http://localhost:5173");
    expect(loadConfig({ NODE_ENV: "production" }).allowedOrigins).toEqual([]);
    expect(
      loadConfig({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://posta.aquapro.example" })
        .allowedOrigins,
    ).toEqual(["https://posta.aquapro.example"]);
  });

  it("accepts a secure production setup", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    expect(config.imap.secure).toBe(true);
    expect(config.cookieSecure).toBe(true);
    expect(config.imap.allowInvalidCertificates).toBe(false);
  });
});

describe("helpers", () => {
  it("parses address lists with names, commas in quotes and semicolons", () => {
    expect(parseAddressList('a@b.sk, Jana <j@x.sk>; "Novák, Ján" <n@y.sk>')).toEqual([
      { email: "a@b.sk" },
      { name: "Jana", email: "j@x.sk" },
      { name: "Novák, Ján", email: "n@y.sk" },
    ]);
    expect(parseAddressList("  ")).toEqual([]);
  });

  it("limits attempts per window and resets", () => {
    let now = 0;
    const limiter = new AttemptLimiter(2, 1000, () => now);
    expect([limiter.attempt("k"), limiter.attempt("k"), limiter.attempt("k")]).toEqual([
      true,
      true,
      false,
    ]);
    now = 1001;
    expect(limiter.attempt("k")).toBe(true);
    limiter.reset("k");
    expect(limiter.attempt("k")).toBe(true);
  });
});
