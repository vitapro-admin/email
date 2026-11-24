import type { CompanyInfo } from "@aquapro/email-render";

export interface AppConfig {
  imap: { host: string; port: number; secure: boolean; allowInvalidCertificates: boolean };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    requireTls: boolean;
    allowInvalidCertificates: boolean;
  };
  /** Domain used to build a sender address from a login name (development directory). */
  mailDomain: string;
  company: CompanyInfo;
  port: number;
  host: string;
  production: boolean;
  cookieName: string;
  cookieSecure: boolean;
  sessionIdleMs: number;
  sessionMaxMs: number;
  /** Extra origins allowed to call the API (for the Vite dev server). Same origin is always allowed. */
  allowedOrigins: string[];
  /** Built web app to serve. Optional. */
  webDist: string | undefined;
}

type Env = Record<string, string | undefined>;

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

/**
 * Reads the configuration from environment variables. In production the connection to the mail
 * server must be encrypted and certificates must be verified; the app refuses to start otherwise.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const production = env["NODE_ENV"] === "production";
  const config: AppConfig = {
    imap: {
      host: env["IMAP_HOST"] ?? "127.0.0.1",
      port: Number(env["IMAP_PORT"] ?? (production ? 993 : 3143)),
      secure: flag(env["IMAP_SECURE"], production),
      allowInvalidCertificates: flag(env["MAIL_ALLOW_INVALID_CERTIFICATES"], !production),
    },
    smtp: {
      host: env["SMTP_HOST"] ?? env["IMAP_HOST"] ?? "127.0.0.1",
      port: Number(env["SMTP_PORT"] ?? (production ? 587 : 3025)),
      secure: flag(env["SMTP_SECURE"], false),
      requireTls: flag(env["SMTP_REQUIRE_TLS"], production),
      allowInvalidCertificates: flag(env["MAIL_ALLOW_INVALID_CERTIFICATES"], !production),
    },
    mailDomain: env["MAIL_DOMAIN"] ?? "aquapro.test",
    company: {
      name: env["COMPANY_NAME"] ?? "AQUA PRO EUROPE",
      legalLine: env["COMPANY_LEGAL_LINE"] ?? "Modelový text päty. Právne údaje doplní firma.",
    },
    port: Number(env["PORT"] ?? 3000),
    host: env["HOST"] ?? "127.0.0.1",
    production,
    cookieName: "aq_session",
    cookieSecure: flag(env["COOKIE_SECURE"], production),
    sessionIdleMs: Number(env["SESSION_IDLE_MINUTES"] ?? 30) * 60_000,
    sessionMaxMs: Number(env["SESSION_MAX_HOURS"] ?? 12) * 3_600_000,
    allowedOrigins: [
      // The Vite dev server (port 5173) forwards requests to this API, so its address is trusted
      // in development only. In production only the same origin is accepted, plus ALLOWED_ORIGINS.
      ...(production ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
      ...(env["ALLOWED_ORIGINS"] ?? "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ],
    webDist: env["WEB_DIST"] || undefined,
  };

  if (production) {
    const problems: string[] = [];
    if (!config.imap.secure) problems.push("IMAP_SECURE musí byť zapnuté");
    if (!config.smtp.secure && !config.smtp.requireTls) {
      problems.push("SMTP vyžaduje šifrovanie (SMTP_SECURE alebo SMTP_REQUIRE_TLS)");
    }
    if (config.imap.allowInvalidCertificates || config.smtp.allowInvalidCertificates) {
      problems.push("MAIL_ALLOW_INVALID_CERTIFICATES nesmie byť zapnuté");
    }
    if (!config.cookieSecure) problems.push("COOKIE_SECURE musí byť zapnuté");
    if (problems.length > 0) {
      throw new Error(`Nebezpečná konfigurácia pre produkciu: ${problems.join("; ")}`);
    }
  }
  return config;
}
