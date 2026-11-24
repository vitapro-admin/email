/**
 * A fake Actiwhere REST API, built ONLY from the "Activewhere REST API: Integration Guide".
 * It reproduces the documented rules (session header, error codes, GET with a JSON body, AND filters,
 * paging, write options preview and rollbackOnErrors, duplicate request id) so the connector and the
 * application can be developed and tested without touching any real CRM.
 *
 * It is NOT the real system. Field names inside records are illustrative until real samples exist.
 * All data is invented.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export const MOCK_CREDENTIALS = {
  key: "00000000-0000-0000-0000-000000000000",
  username: "integration-user",
  password: "test-password",
} as const;

type Obj = Record<string, unknown>;

const customers: Obj[] = [
  {
    customerId: 86858,
    name: "Hotel Panoráma s.r.o.",
    statusId: 1,
    addresses: [{ addressId: 1, street: "Hlavná 14", town: "Poprad", postalCode: "05801" }],
    contacts: [
      {
        contactId: 11,
        name: "Jana Horváthová",
        email: "j.horvathova@hotelpanorama.example",
        phone: "+421900000101",
      },
    ],
    contracts: [{ contractId: 501, documentId: 48213 }],
  },
  {
    customerId: 86859,
    name: "Kancelárie Westend a.s.",
    statusId: 1,
    addresses: [
      { addressId: 2, street: "Einsteinova 21", town: "Bratislava", postalCode: "85101" },
    ],
    contacts: [
      {
        contactId: 12,
        name: "Lucia Mináriková",
        email: "l.minarikova@westend.example",
        phone: "+421900000103",
      },
    ],
    contracts: [],
  },
  {
    customerId: 86860,
    name: "Autoservis Kováč",
    statusId: 2,
    addresses: [{ addressId: 3, street: "Priemyselná 5", town: "Trenčín", postalCode: "91101" }],
    contacts: [
      { contactId: 13, name: "Ján Kováč", email: "kovac@autoservis.example", phone: null },
    ],
    contracts: [],
  },
];

const events: Obj[] = [
  {
    eventId: 9921,
    subject: "Otázka na servisný interval",
    categoryId: 2,
    statusId: 1,
    priorityId: 2,
  },
  {
    eventId: 9934,
    subject: "Dopyt na prenájom dávkovačov",
    categoryId: 2,
    statusId: 1,
    priorityId: 2,
  },
];

const orders: Obj[] = Array.from({ length: 25 }, (_, i) => ({
  orderId: 1000 + i,
  documentTypeId: 3,
  customerId: 86858 + (i % 3),
  statusId: 1,
}));

const referenceTables: Record<string, Obj[]> = {
  eventCategories: [
    { id: 1, name: "Telefonát" },
    { id: 2, name: "E-mail" },
  ],
  eventStatuses: [
    { id: 1, name: "Otvorený" },
    { id: 2, name: "Uzavretý" },
  ],
  priorities: [
    { id: 1, name: "Nízka" },
    { id: 2, name: "Stredná" },
    { id: 3, name: "Vysoká" },
  ],
};

const VALID = {
  categoryId: new Set([1, 2]),
  statusId: new Set([1, 2]),
  priorityId: new Set([1, 2, 3]),
};

export interface MockOptions {
  sessionSeconds?: number;
  now?: () => number;
}

export interface MockActiwhere {
  /** Base URL including /rest, ready for ActiwhereClient. */
  url: string;
  close(): Promise<void>;
  state: {
    createdEvents: Obj[];
    processedIds: Set<string>;
    logins: number;
    /** Every request received: method, path and whether a body was present. */
    requests: { method: string; path: string; hadBody: boolean }[];
    expireAllSessions(): void;
    /** The mock's own data. Tests may change it to simulate edits made in the CRM. */
    data: { customers: Obj[]; events: Obj[]; orders: Obj[] };
    /** Makes GET <endpoint> fail with HTTP 500 from this page on (to test a read that breaks halfway). */
    failFromPage: { endpoint: string; page: number } | undefined;
  };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

const fail = (res: http.ServerResponse, status: number, code: string, message: string) =>
  send(res, status, { error: { code, message } });

function csvIds(value: unknown): Set<number> | undefined {
  // "Lists of ids are comma-separated strings. Anything else makes the filter ignored."
  if (typeof value !== "string" || !/^[\d,\s]+$/.test(value)) return undefined;
  return new Set(
    value
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n)),
  );
}

function page<T>(rows: T[], paging: Obj | undefined): T[] {
  const records =
    typeof paging?.["records"] === "number" ? Math.min(paging["records"], 10_000) : 10_000;
  const pageNo = typeof paging?.["page"] === "number" ? Math.max(1, paging["page"]) : 1;
  return rows.slice((pageNo - 1) * records, pageNo * records);
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

export async function createMockActiwhere(options: MockOptions = {}): Promise<MockActiwhere> {
  const now = options.now ?? Date.now;
  const lifetimeMs = (options.sessionSeconds ?? 3600) * 1000;
  const sessions = new Map<string, number>();
  let expiredEpoch = 0;
  const state: MockActiwhere["state"] = {
    createdEvents: [],
    processedIds: new Set(),
    logins: 0,
    requests: [],
    data: {
      customers: structuredClone(customers),
      events: structuredClone(events),
      orders: structuredClone(orders),
    },
    failFromPage: undefined,
    expireAllSessions: () => {
      expiredEpoch += 1;
      sessions.clear();
    },
  };
  const expired = new Set<string>();
  let counter = 0;
  let nextEventId = 20_000;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const method = req.method ?? "GET";
      const path = (req.url ?? "").split("?")[0] ?? "";
      const raw = Buffer.concat(chunks).toString("utf8");
      state.requests.push({ method, path, hadBody: raw.length > 0 });

      let body: Obj = {};
      if (raw.trim() !== "") {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            throw new Error("not an object");
          body = parsed as Obj;
        } catch {
          return fail(res, 400, "05", "Invalid json");
        }
      }

      if (method === "POST" && path === "/rest/login") {
        if (body["key"] !== MOCK_CREDENTIALS.key) return fail(res, 401, "01", "Invalid API key");
        if (
          body["username"] !== MOCK_CREDENTIALS.username ||
          body["password"] !== MOCK_CREDENTIALS.password
        ) {
          return fail(res, 401, "03", "Invalid credentials");
        }
        state.logins += 1;
        const id = `SESSION-${++counter}-${expiredEpoch}`;
        sessions.set(id, now() + lifetimeMs);
        return send(res, 200, {
          session: {
            id,
            timeout: Math.floor(lifetimeMs / 1000),
            user: { id: 367, username: MOCK_CREDENTIALS.username },
          },
        });
      }

      // Every other call needs a live session.
      const sessionId = req.headers["sessionid"];
      const id = typeof sessionId === "string" ? sessionId : undefined;
      if (!id || (!sessions.has(id) && !expired.has(id)))
        return fail(res, 401, "01", "Invalid Session");
      const until = sessions.get(id);
      if (until === undefined || until < now()) {
        sessions.delete(id);
        expired.add(id);
        return fail(res, 401, "02", "Session expired");
      }
      sessions.set(id, now() + lifetimeMs); // the session slides

      const endpoint = path.replace(/^\/rest\//, "");
      const filter = (body["filter"] ?? {}) as Obj;
      const opts = (body["options"] ?? {}) as Obj;
      const paging = body["paging"] as Obj | undefined;
      const finish = (key: string, rows: unknown[]) => {
        const data = opts["nullValues"] === true ? rows : rows.map(stripNulls);
        send(res, 200, { [key]: data });
      };

      const failing = state.failFromPage;
      if (
        method === "GET" &&
        failing &&
        failing.endpoint === endpoint &&
        (typeof paging?.["page"] === "number" ? paging["page"] : 1) >= failing.page
      ) {
        return fail(res, 500, "99", "Simulated server error");
      }

      if (method === "GET" && endpoint === "customers") {
        let rows = state.data.customers.filter((c) => {
          if (
            filter["customerId"] !== undefined &&
            filter["customerId"] !== null &&
            c["customerId"] !== filter["customerId"]
          )
            return false;
          if (
            typeof filter["name"] === "string" &&
            !String(c["name"]).toLowerCase().includes(filter["name"].toLowerCase())
          )
            return false;
          const statuses = csvIds(filter["statuses"]);
          if (statuses && !statuses.has(c["statusId"] as number)) return false;
          return true;
        });
        rows = rows.map((c) => {
          const copy: Obj = {
            customerId: c["customerId"],
            name: c["name"],
            statusId: c["statusId"],
          };
          if (opts["includeAddressDetails"]) copy["addresses"] = c["addresses"];
          if (opts["includeContactDetails"]) copy["contacts"] = c["contacts"];
          if (opts["includeContractDetails"]) copy["contracts"] = c["contracts"];
          return copy;
        });
        return finish("customers", page(rows, paging));
      }
      if (method === "GET" && endpoint === "events") {
        // Documented limitation: the only filter is eventId. Other keys are ignored.
        const rows = state.data.events.filter(
          (e) =>
            filter["eventId"] === undefined ||
            filter["eventId"] === null ||
            e["eventId"] === filter["eventId"],
        );
        return finish("events", page(rows, paging));
      }
      if (method === "GET" && endpoint === "orders")
        return finish("orders", page(state.data.orders, paging));
      if (method === "GET" && endpoint === "referenceData") {
        const table =
          typeof filter["tableName"] === "string"
            ? referenceTables[filter["tableName"]]
            : undefined;
        // An unknown table name returns an empty answer, not an error.
        return send(res, 200, table ? { referenceData: table } : {});
      }
      if (method === "GET" && endpoint === "documentTypes") {
        return finish("documentTypes", [{ id: 3, name: "Objednávka" }]);
      }

      if (method === "POST" && endpoint === "events") {
        if (!Array.isArray(body["requests"])) return fail(res, 400, "04", "Invalid json structure");
        const callId = typeof body["id"] === "string" ? body["id"] : undefined;
        if (callId && state.processedIds.has(callId))
          return fail(res, 400, "03", "Request with same ID already processed");

        const preview = opts["preview"] === true;
        const rollback = opts["rollbackOnErrors"] !== false;
        const started = new Date(now()).toISOString();
        const entries = body["requests"] as Obj[];
        const results: Obj[] = [];
        const accepted: Obj[] = [];
        let errors = 0;
        for (const entry of entries) {
          const details: { field: string; errorDescription: string }[] = [];
          if (typeof entry["subject"] !== "string" || entry["subject"].trim() === "")
            details.push({ field: "subject", errorDescription: "required" });
          for (const field of ["categoryId", "statusId", "priorityId"] as const) {
            const value = entry[field];
            if (value !== undefined && !VALID[field].has(value as number))
              details.push({ field, errorDescription: "invalid" });
          }
          if (details.length > 0) {
            errors += 1;
            results.push({ requestId: entry["requestId"], errorCode: "05", errorDetails: details });
          } else {
            const created = { ...entry, eventId: nextEventId++ };
            accepted.push(created);
            results.push({ requestId: entry["requestId"], id: created["eventId"] });
          }
        }
        const rolledBack = preview || (errors > 0 && rollback);
        if (!rolledBack) {
          state.createdEvents.push(...accepted);
          if (callId) state.processedIds.add(callId);
        }
        return send(res, 200, {
          info: {
            startTime: started,
            endTime: new Date(now()).toISOString(),
            request: {
              total: entries.length,
              completed: errors > 0 && rollback ? 0 : entries.length - errors,
              errors,
            },
          },
          results,
        });
      }

      return fail(res, 404, "02", "Invalid Method");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/rest`,
    state,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
