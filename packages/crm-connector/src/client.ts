import { randomUUID } from "node:crypto";
import { ActiwhereError, ActiwhereWriteError, CrmWriteBlockedError } from "./errors.js";
import type { EntryError } from "./errors.js";
import { sendJson } from "./http.js";

export type JsonObject = Record<string, unknown>;

/** Endpoints that can be read (GET). From the Actiwhere REST API Integration Guide. */
export const READ_ENDPOINTS = [
  "customers",
  "contracts",
  "leads",
  "salesUnitTemplates",
  "salesUnits",
  "events",
  "orders",
  "documents",
  "payments",
  "customerBalances",
  "suppliers",
  "stockDocuments",
  "stockReport",
  "items",
  "standardAddresses",
  "documentTypes",
  "referenceData",
] as const;
export type ReadEndpoint = (typeof READ_ENDPOINTS)[number];

export interface ActiwhereConfig {
  /** Base URL up to and including /rest, e.g. https://host/app/rest */
  baseUrl: string;
  apiKey: string;
  username: string;
  password: string;
  /**
   * Which CRM this is. Must be stated explicitly, there is no default: it decides what writes are
   * possible. The connector cannot detect it, so whoever configures it is responsible for it.
   */
  environment: "test" | "production";
  /**
   * off      = nothing is ever written (default)
   * preview  = writes are validated by Actiwhere and rolled back; nothing is created
   * on       = writes really happen (test environment only, unless production writes are unlocked)
   */
  writes?: "off" | "preview" | "on";
  /** Only these writes may ever be sent. Default: ["POST /events"]. */
  writableEndpoints?: string[];
  /** Production writes stay locked unless this equals UNLOCK_PRODUCTION_WRITES. */
  productionWriteUnlock?: string;
  sessionTimeoutSeconds?: number;
  requestTimeoutMs?: number;
}

/** The exact words that unlock real writes to a PRODUCTION CRM. Deliberately awkward to type. */
export const UNLOCK_PRODUCTION_WRITES = "ZAPISUJEM-DO-ZIVEHO-CRM";

export interface RequestLogEntry {
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  preview: boolean;
  /** Never contains credentials, session ids or request bodies. */
  environment: "test" | "production";
}

export interface ReadRequest {
  filter?: JsonObject;
  options?: JsonObject;
  paging?: { page?: number; records?: number };
}

export interface WriteResult {
  /** true when Actiwhere only validated the call and rolled it back. Nothing was created. */
  preview: boolean;
  results: { requestId: number | undefined; id: unknown }[];
}

interface Hooks {
  onRequest?: (entry: RequestLogEntry) => void;
  now?: () => number;
}

const SESSION_ERROR_CODES = new Set(["01", "02"]);
const MAX_PAGES = 1000;

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export class ActiwhereClient {
  private readonly root: string;
  private readonly writes: "off" | "preview" | "on";
  private readonly writable: Set<string>;
  private sessionId: string | undefined;
  private loginInFlight: Promise<string> | undefined;

  constructor(
    private readonly config: ActiwhereConfig,
    private readonly hooks: Hooks = {},
  ) {
    const url = new URL(config.baseUrl);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) {
      throw new Error(
        "Actiwhere vyžaduje https (http je povolené len pre lokálny testovací server).",
      );
    }
    this.root = config.baseUrl.replace(/\/+$/, "");
    this.writes = config.writes ?? "off";
    this.writable = new Set(config.writableEndpoints ?? ["POST /events"]);
  }

  get environment(): "test" | "production" {
    return this.config.environment;
  }

  get writeMode(): "off" | "preview" | "on" {
    return this.writes;
  }

  // ---------- reading

  /** One read call. Filters are combined with AND by Actiwhere. */
  async read(endpoint: ReadEndpoint, request: ReadRequest = {}): Promise<JsonObject> {
    const body: JsonObject = {};
    if (request.options) body["options"] = request.options;
    if (request.filter) body["filter"] = request.filter;
    if (request.paging) body["paging"] = request.paging;
    const result = await this.call("GET", `/${endpoint}`, body);
    return result;
  }

  /**
   * Reads every page of a list. `key` is the named key the records arrive under, for example
   * "customers". Stops when a page comes back shorter than the page size.
   */
  async readAll(
    endpoint: ReadEndpoint,
    key: string,
    request: Omit<ReadRequest, "paging"> = {},
    pageSize = 1000,
  ): Promise<JsonObject[]> {
    const all: JsonObject[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const answer = await this.read(endpoint, { ...request, paging: { page, records: pageSize } });
      const rows = answer[key];
      if (!Array.isArray(rows)) {
        throw new ActiwhereError(200, "unexpected-shape", `V odpovedi chýba zoznam „${key}“.`);
      }
      all.push(...rows.filter((r): r is JsonObject => asObject(r) !== undefined));
      if (rows.length < pageSize) return all;
    }
    throw new ActiwhereError(200, "too-many-pages", "Zoznam má neprimerane veľa strán.");
  }

  // ---------- writing (guarded)

  /**
   * Creates events. Passes through every safety rule: the write mode, the allowed endpoint list,
   * the production lock, forced preview, no validation bypass, and a unique id per call so a
   * repeated call cannot create duplicates.
   */
  async createEvents(entries: JsonObject[], options: { id?: string } = {}): Promise<WriteResult> {
    return this.write("POST", "/events", entries, options);
  }

  private async write(
    method: "POST" | "PATCH",
    path: string,
    entries: JsonObject[],
    options: { id?: string },
  ): Promise<WriteResult> {
    const label = `${method} ${path}`;
    if (this.writes === "off") {
      throw new CrmWriteBlockedError("Zápis do CRM je vypnutý (writes = off).");
    }
    if (!this.writable.has(label)) {
      throw new CrmWriteBlockedError(
        `Zápis „${label}“ nie je povolený. Povolené: ${[...this.writable].join(", ") || "nič"}.`,
      );
    }
    if (
      this.writes === "on" &&
      this.config.environment === "production" &&
      this.config.productionWriteUnlock !== UNLOCK_PRODUCTION_WRITES
    ) {
      throw new CrmWriteBlockedError(
        "Zápis do ŽIVÉHO CRM je zamknutý. Skutočný zápis povolený len v testovacom prostredí.",
      );
    }
    if (entries.length === 0) throw new CrmWriteBlockedError("Chýbajú záznamy na zápis.");

    const preview = this.writes === "preview";
    const requests = entries.map((entry, index) => {
      const copy: JsonObject = { ...entry, requestId: index + 1 };
      return copy;
    });
    const body: JsonObject = {
      id: options.id ?? randomUUID(),
      // Fixed by us: validation can never be skipped, and a single bad entry rolls everything back.
      options: { preview, rollbackOnErrors: true, ignoreValidations: false },
      requests,
    };

    const answer = await this.call(method, path, body, preview);
    return this.checkWrite(answer, preview);
  }

  private checkWrite(answer: JsonObject, preview: boolean): WriteResult {
    const info = asObject(answer["info"]);
    const request = asObject(info?.["request"]);
    const errors = typeof request?.["errors"] === "number" ? request["errors"] : undefined;
    const results = Array.isArray(answer["results"])
      ? answer["results"].map(asObject).filter((r): r is JsonObject => r !== undefined)
      : [];

    if (errors === undefined) {
      throw new ActiwhereError(
        200,
        "unexpected-shape",
        "Odpoveď na zápis nemá očakávanú štruktúru.",
      );
    }
    if (errors > 0) {
      const failed: EntryError[] = results
        .filter((r) => r["errorCode"] !== undefined)
        .map((r) => ({
          requestId: typeof r["requestId"] === "number" ? r["requestId"] : undefined,
          errorCode: typeof r["errorCode"] === "string" ? r["errorCode"] : undefined,
          details: (Array.isArray(r["errorDetails"]) ? r["errorDetails"] : [])
            .map(asObject)
            .filter((d): d is JsonObject => d !== undefined)
            .map((d) => ({
              field: String(d["field"] ?? "?"),
              description: String(d["errorDescription"] ?? "?"),
            })),
        }));
      throw new ActiwhereWriteError(failed);
    }
    return {
      preview,
      results: results.map((r) => ({
        requestId: typeof r["requestId"] === "number" ? r["requestId"] : undefined,
        id: r["id"],
      })),
    };
  }

  // ---------- transport with session handling

  private async login(): Promise<string> {
    const body: JsonObject = {
      key: this.config.apiKey,
      username: this.config.username,
      password: this.config.password,
      ...(this.config.sessionTimeoutSeconds ? { timeout: this.config.sessionTimeoutSeconds } : {}),
    };
    const started = (this.hooks.now ?? Date.now)();
    const { status, json } = await sendJson(
      "POST",
      new URL(`${this.root}/login`),
      {},
      body,
      this.config.requestTimeoutMs ?? 30_000,
    );
    this.log("POST", "/login", status, started, false);
    const answer = asObject(json);
    const session = asObject(answer?.["session"]);
    const id = session?.["id"];
    if (typeof id !== "string" || id === "") {
      const error = asObject(answer?.["error"]);
      // The message never repeats the credentials. 01 = unknown API key, 03 = bad credentials.
      throw new ActiwhereError(
        status,
        String(error?.["code"] ?? "login-failed"),
        "Prihlásenie do Actiwhere zlyhalo (skontrolujte kľúč, meno a heslo).",
      );
    }
    return id;
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    // One login at a time, even when several calls start together.
    this.loginInFlight ??= this.login().finally(() => {
      this.loginInFlight = undefined;
    });
    this.sessionId = await this.loginInFlight;
    return this.sessionId;
  }

  private async call(
    method: string,
    path: string,
    body: unknown,
    preview = false,
  ): Promise<JsonObject> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await this.ensureSession();
      const started = (this.hooks.now ?? Date.now)();
      const { status, json } = await sendJson(
        method,
        new URL(`${this.root}${path}`),
        { SessionId: session },
        body,
        this.config.requestTimeoutMs ?? 30_000,
      );
      this.log(method, path, status, started, preview);
      const answer = asObject(json);
      const error = asObject(answer?.["error"]);

      // Codes 01 and 02: the session is unknown or expired. Log in again and retry once.
      if (status === 401 && SESSION_ERROR_CODES.has(String(error?.["code"])) && attempt === 0) {
        this.sessionId = undefined;
        continue;
      }
      if (status !== 200 || error) {
        throw new ActiwhereError(
          status,
          String(error?.["code"] ?? "http-error"),
          String(error?.["message"] ?? `Actiwhere vrátil chybu ${status}.`),
        );
      }
      if (!answer)
        throw new ActiwhereError(status, "unexpected-shape", "Actiwhere vrátil prázdnu odpoveď.");
      return answer;
    }
    throw new ActiwhereError(401, "session", "Nepodarilo sa obnoviť reláciu v Actiwhere.");
  }

  private log(
    method: string,
    endpoint: string,
    status: number,
    started: number,
    preview: boolean,
  ): void {
    this.hooks.onRequest?.({
      method,
      endpoint,
      status,
      durationMs: (this.hooks.now ?? Date.now)() - started,
      preview,
      environment: this.config.environment,
    });
  }
}
