import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { ImapMailGateway, OutgoingMessageError, SmtpMailSender } from "@aquapro/mail-gateway";
import type { MailGateway, MailSender } from "@aquapro/mail-gateway";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { parseAddressList } from "./address.js";
import { ComposeError, prepareCompose, renderCompose, toOutgoing } from "./compose.js";
import type { ComposeMode } from "./compose.js";
import { loadConfig } from "./config.js";
import type { AppConfig } from "./config.js";
import { toMessageView } from "./message-view.js";
import { AttemptLimiter } from "./rate-limit.js";
import { SessionStore } from "./sessions.js";
import type { Session } from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    authSession: Session | undefined;
  }
}

export interface AppDeps {
  config?: AppConfig;
  /** Mailbox access for a logged-in user. Replaceable in tests. */
  createGateway?: (session: Pick<Session, "username" | "password">) => MailGateway;
  createSender?: (session: Session) => MailSender;
  /** Checks mailbox credentials. Returns false for wrong credentials, throws for server problems. */
  authenticate?: (username: string, password: string) => Promise<boolean>;
  now?: () => number;
  logger?: boolean;
}

const COMPOSE_MODES = ["new", "reply", "replyAll", "forward"] as const;

const composeBody = z.object({
  mode: z.enum(COMPOSE_MODES),
  folder: z.string().min(1).max(500).optional(),
  uid: z.number().int().positive().optional(),
  to: z.string().max(5000),
  cc: z.string().max(5000).default(""),
  bcc: z.string().max(5000).default(""),
  subject: z.string().max(998),
  doc: z.unknown(),
});

const prepareQuery = z.object({
  mode: z.enum(["reply", "replyAll", "forward"]),
  folder: z.string().min(1).max(500),
  uid: z.coerce.number().int().positive(),
});

function profileFor(username: string, domain: string) {
  const local = username.split("@")[0] ?? username;
  const name = local.charAt(0).toUpperCase() + local.slice(1);
  return {
    name,
    role: "Podpora obchodu",
    email: username.includes("@") ? username : `${username}@${domain}`,
  };
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const config = deps.config ?? loadConfig();
  const now = deps.now ?? Date.now;

  const createGateway =
    deps.createGateway ??
    ((s) =>
      new ImapMailGateway({
        host: config.imap.host,
        port: config.imap.port,
        secure: config.imap.secure,
        user: s.username,
        password: s.password,
        allowInvalidCertificates: config.imap.allowInvalidCertificates,
      }));

  const createSender =
    deps.createSender ??
    ((s) =>
      new SmtpMailSender({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        requireTls: config.smtp.requireTls,
        user: s.username,
        password: s.password,
        from: { name: s.profile.name, email: s.profile.email },
        allowInvalidCertificates: config.smtp.allowInvalidCertificates,
      }));

  const authenticate =
    deps.authenticate ??
    (async (username: string, password: string) => {
      try {
        await createGateway({ username, password }).listFolders();
        return true;
      } catch (error) {
        if ((error as { authenticationFailed?: boolean }).authenticationFailed) return false;
        throw error;
      }
    });

  const sessions = new SessionStore(config.sessionIdleMs, config.sessionMaxMs, now);
  const loginLimiter = new AttemptLimiter(5, 5 * 60_000, now);
  const ipLimiter = new AttemptLimiter(30, 5 * 60_000, now);

  const app = Fastify({
    logger: deps.logger
      ? { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] }
      : false,
    bodyLimit: 5 * 1024 * 1024,
  });
  await app.register(fastifyCookie);
  app.decorateRequest("authSession", undefined);

  const sweeper = setInterval(() => sessions.sweep(), 60_000);
  sweeper.unref();
  app.addHook("onClose", async () => clearInterval(sweeper));

  // ---- security headers on every response
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    if (config.cookieSecure) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  // ---- API guard: login required, and state-changing calls must come from our own web app
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    const path = req.url.split("?")[0];

    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.origin;
      const own = `${req.protocol}://${req.headers.host ?? ""}`;
      const originOk = !origin || origin === own || config.allowedOrigins.includes(origin);
      if (!originOk || req.headers["x-aq-client"] !== "web") {
        return reply.code(403).send(errorBody("forbidden", "Požiadavka nie je povolená."));
      }
    }

    if (path === "/api/login") return;
    const session = sessions.get(req.cookies[config.cookieName]);
    if (!session) return reply.code(401).send(errorBody("unauthorized", "Nie ste prihlásený."));
    req.authSession = session;
  });

  const session = (req: FastifyRequest): Session => {
    if (!req.authSession) throw new Error("session missing");
    return req.authSession;
  };

  // ---- auth
  app.post("/api/login", async (req, reply) => {
    const parsed = z
      .object({ username: z.string().min(1).max(200), password: z.string().min(1).max(500) })
      .safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
    const { username, password } = parsed.data;

    const userKey = `${req.ip}|${username.toLowerCase()}`;
    if (!ipLimiter.attempt(req.ip) || !loginLimiter.attempt(userKey)) {
      return reply
        .code(429)
        .send(errorBody("too-many-attempts", "Príliš veľa pokusov. Skúste neskôr."));
    }
    let ok: boolean;
    try {
      ok = await authenticate(username, password);
    } catch {
      return reply.code(502).send(errorBody("mail-server", "Poštový server nie je dostupný."));
    }
    if (!ok)
      return reply.code(401).send(errorBody("bad-credentials", "Nesprávne meno alebo heslo."));

    loginLimiter.reset(userKey);
    const created = sessions.create(username, password, profileFor(username, config.mailDomain));
    reply.setCookie(config.cookieName, created.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
      path: "/",
      maxAge: Math.floor(config.sessionMaxMs / 1000),
    });
    return { user: created.profile };
  });

  app.post("/api/logout", async (req, reply) => {
    sessions.destroy(session(req).id);
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (req) => ({ user: session(req).profile }));

  // ---- mail
  const mailError = (reply: FastifyReply, error: unknown) => {
    if (error instanceof OutgoingMessageError || error instanceof ComposeError) {
      return reply.code(400).send(errorBody(error.code, error.message));
    }
    reply.log.error({ err: error }, "mail server error");
    return reply.code(502).send(errorBody("mail-server", "Poštový server vrátil chybu."));
  };

  app.get("/api/folders", async (req, reply) => {
    try {
      return await createGateway(session(req)).listFolders();
    } catch (error) {
      return mailError(reply, error);
    }
  });

  app.get("/api/messages", async (req, reply) => {
    const q = z
      .object({
        folder: z.string().min(1).max(500),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        beforeUid: z.coerce.number().int().positive().optional(),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
    try {
      return await createGateway(session(req)).listMessages(q.data.folder, {
        limit: q.data.limit,
        ...(q.data.beforeUid !== undefined ? { beforeUid: q.data.beforeUid } : {}),
      });
    } catch (error) {
      return mailError(reply, error);
    }
  });

  app.get("/api/message", async (req, reply) => {
    const q = z
      .object({
        folder: z.string().min(1).max(500),
        uid: z.coerce.number().int().positive(),
        images: z.enum(["0", "1"]).default("0"),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
    try {
      const gateway = createGateway(session(req));
      const detail = await gateway.getMessage(q.data.folder, q.data.uid);
      if (!detail) return reply.code(404).send(errorBody("not-found", "Správa neexistuje."));
      if (!detail.seen) {
        await gateway.markSeen(q.data.folder, q.data.uid, true);
        detail.seen = true;
      }
      return toMessageView(detail, q.data.images === "1");
    } catch (error) {
      return mailError(reply, error);
    }
  });

  app.get("/api/attachment", async (req, reply) => {
    const q = z
      .object({
        folder: z.string().min(1).max(500),
        uid: z.coerce.number().int().positive(),
        index: z.coerce.number().int().min(0).max(1000),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
    try {
      const file = await createGateway(session(req)).getAttachment(
        q.data.folder,
        q.data.uid,
        q.data.index,
      );
      if (!file) return reply.code(404).send(errorBody("not-found", "Príloha neexistuje."));
      // Always a download, never shown in the page, and never trusting the sender's content type.
      const safeName = file.filename.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150) || "priloha";
      return reply
        .header("Content-Type", "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        )
        .header("Cache-Control", "private, no-store")
        .send(file.content);
    } catch (error) {
      return mailError(reply, error);
    }
  });

  // ---- compose
  app.get("/api/compose/prepare", async (req, reply) => {
    const q = prepareQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
    try {
      const s = session(req);
      const original = await createGateway(s).getMessage(q.data.folder, q.data.uid);
      if (!original) return reply.code(404).send(errorBody("not-found", "Správa neexistuje."));
      return prepareCompose(q.data.mode, original, s.profile.email);
    } catch (error) {
      return mailError(reply, error);
    }
  });

  const loadCompose = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = composeBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send(errorBody("invalid-request", "Neplatné údaje."));
      return undefined;
    }
    const b = parsed.data;
    const s = session(req);
    const gateway = createGateway(s);
    let original;
    if (b.mode !== "new") {
      if (!b.folder || !b.uid) {
        reply.code(400).send(errorBody("original-required", "Chýba pôvodná správa."));
        return undefined;
      }
      original = await gateway.getMessage(b.folder, b.uid);
      if (!original) {
        reply.code(404).send(errorBody("not-found", "Pôvodná správa neexistuje."));
        return undefined;
      }
    }
    return { b, s, gateway, original, mode: b.mode as ComposeMode };
  };

  app.post("/api/compose/preview", async (req, reply) => {
    try {
      const ctx = await loadCompose(req, reply);
      if (!ctx) return reply;
      const result = await renderCompose({
        mode: ctx.mode,
        original: ctx.original,
        subject: ctx.b.subject,
        doc: ctx.b.doc,
        sender: ctx.s.profile,
        company: config.company,
        logo: "data",
      });
      return { subject: result.subject, html: result.rendered.html };
    } catch (error) {
      return mailError(reply, error);
    }
  });

  app.post("/api/compose/send", async (req, reply) => {
    try {
      const ctx = await loadCompose(req, reply);
      if (!ctx) return reply;
      const input = {
        mode: ctx.mode,
        original: ctx.original,
        subject: ctx.b.subject,
        doc: ctx.b.doc,
        sender: ctx.s.profile,
        company: config.company,
        logo: "cid" as const,
      };
      const rendered = await renderCompose(input);
      const outgoing = toOutgoing(input, rendered, {
        to: parseAddressList(ctx.b.to),
        cc: parseAddressList(ctx.b.cc),
        bcc: parseAddressList(ctx.b.bcc),
      });
      const sent = await createSender(ctx.s).send(outgoing);

      // The message is sent. Saving the copy must never turn that into an error for the user.
      let savedToSent = false;
      try {
        const folders = await ctx.gateway.listFolders();
        const sentFolder = folders.find((f) => f.specialUse === "sent")?.path ?? "Sent";
        await ctx.gateway.appendMessage(sentFolder, sent.raw, ["\\Seen"]);
        savedToSent = true;
      } catch (error) {
        req.log.warn({ err: error }, "could not save a copy to Sent");
      }
      return { messageId: sent.messageId, savedToSent };
    } catch (error) {
      return mailError(reply, error);
    }
  });

  // ---- built web app (optional) with single-page fallback
  const dist = config.webDist ? resolve(config.webDist) : undefined;
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send(errorBody("not-found", "Nenájdené."));
    });
  }

  return app;
}
