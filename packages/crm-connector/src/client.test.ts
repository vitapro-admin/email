import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActiwhereClient, UNLOCK_PRODUCTION_WRITES } from "./client.js";
import type { ActiwhereConfig, RequestLogEntry } from "./client.js";
import { ActiwhereError, ActiwhereWriteError, CrmWriteBlockedError } from "./errors.js";
import { MOCK_CREDENTIALS, createMockActiwhere } from "./mock/server.js";
import type { MockActiwhere } from "./mock/server.js";

let mock: MockActiwhere;

beforeEach(async () => {
  mock = await createMockActiwhere();
});
afterEach(async () => {
  await mock.close();
});

function config(overrides: Partial<ActiwhereConfig> = {}): ActiwhereConfig {
  return {
    baseUrl: mock.url,
    apiKey: MOCK_CREDENTIALS.key,
    username: MOCK_CREDENTIALS.username,
    password: MOCK_CREDENTIALS.password,
    environment: "test",
    ...overrides,
  };
}

const event = (overrides: Record<string, unknown> = {}) => ({
  subject: "E-mail klientovi: potvrdenie dodávky",
  categoryId: 2,
  statusId: 1,
  priorityId: 2,
  ...overrides,
});

describe("reading", () => {
  it("logs in and reads with a JSON body on GET, as the API requires", async () => {
    const client = new ActiwhereClient(config());
    const answer = await client.read("customers", { filter: { customerId: 86858 } });
    expect((answer["customers"] as unknown[]).length).toBe(1);
    const get = mock.state.requests.find((r) => r.method === "GET");
    expect(get?.hadBody).toBe(true);
    expect(mock.state.logins).toBe(1);
  });

  it("combines filters with AND and honours the include options", async () => {
    const client = new ActiwhereClient(config());
    const both = await client.read("customers", {
      filter: { name: "hotel", statuses: "1,2" },
      options: { includeContactDetails: true },
    });
    const customers = both["customers"] as { name: string; contacts?: { email: string }[] }[];
    expect(customers).toHaveLength(1);
    expect(customers[0]?.contacts?.[0]?.email).toBe("j.horvathova@hotelpanorama.example");
    const none = await client.read("customers", { filter: { name: "hotel", statuses: "2" } });
    expect(none["customers"]).toEqual([]);
  });

  it("leaves out null properties unless nullValues is requested", async () => {
    const client = new ActiwhereClient(config());
    const plain = await client.read("customers", {
      filter: { customerId: 86860 },
      options: { includeContactDetails: true },
    });
    expect(JSON.stringify(plain)).not.toContain('"phone"');
    const withNulls = await client.read("customers", {
      filter: { customerId: 86860 },
      options: { includeContactDetails: true, nullValues: true },
    });
    expect(JSON.stringify(withNulls)).toContain('"phone":null');
  });

  it("reads every page and stops after a short page", async () => {
    const client = new ActiwhereClient(config());
    const all = await client.readAll("orders", "orders", {}, 10);
    expect(all).toHaveLength(25);
    expect(mock.state.requests.filter((r) => r.path.endsWith("/orders"))).toHaveLength(3);
  });

  it("does not loop forever when the last page is exactly full", async () => {
    const client = new ActiwhereClient(config());
    const all = await client.readAll("orders", "orders", {}, 25);
    expect(all).toHaveLength(25);
    expect(mock.state.requests.filter((r) => r.path.endsWith("/orders"))).toHaveLength(2);
  });

  it("returns an empty answer for an unknown reference table (documented behaviour)", async () => {
    const client = new ActiwhereClient(config());
    expect(await client.read("referenceData", { filter: { tableName: "neexistuje" } })).toEqual({});
  });
});

describe("sessions", () => {
  it("shares one login between simultaneous calls", async () => {
    const client = new ActiwhereClient(config());
    await Promise.all(Array.from({ length: 5 }, () => client.read("customers")));
    expect(mock.state.logins).toBe(1);
  });

  it("logs in again once when the session is lost, and retries", async () => {
    const client = new ActiwhereClient(config());
    await client.read("customers");
    mock.state.expireAllSessions();
    const answer = await client.read("customers");
    expect((answer["customers"] as unknown[]).length).toBe(3);
    expect(mock.state.logins).toBe(2);
  });

  it("recovers from an expired session (code 02)", async () => {
    await mock.close();
    let clock = 1_000_000;
    mock = await createMockActiwhere({ sessionSeconds: 60, now: () => clock });
    const client = new ActiwhereClient(config());
    await client.read("customers");
    clock += 61_000;
    await client.read("customers");
    expect(mock.state.logins).toBe(2);
  });

  it("reports wrong credentials without repeating them", async () => {
    const client = new ActiwhereClient(config({ password: "tajne-heslo-123" }));
    const error = await client.read("customers").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ActiwhereError);
    expect((error as ActiwhereError).code).toBe("03");
    expect(String((error as Error).message)).not.toContain("tajne-heslo-123");
  });

  it("reports an unknown API key", async () => {
    const client = new ActiwhereClient(config({ apiKey: "11111111-1111-1111-1111-111111111111" }));
    const error = (await client.read("customers").catch((e: unknown) => e)) as ActiwhereError;
    expect(error.code).toBe("01");
  });

  it("refuses plain http for anything but a local test server", () => {
    expect(() => new ActiwhereClient(config({ baseUrl: "http://crm.firma.example/rest" }))).toThrow(
      /https/,
    );
    expect(() => new ActiwhereClient(config({ baseUrl: "http://127.0.0.1:1/rest" }))).not.toThrow();
  });

  it("reports an unreachable server as a network error", async () => {
    const client = new ActiwhereClient(config({ baseUrl: "http://127.0.0.1:1/rest" }));
    const error = (await client.read("customers").catch((e: unknown) => e)) as ActiwhereError;
    expect(error).toBeInstanceOf(ActiwhereError);
    expect(error.code).toBe("network");
  });
});

describe("write safety", () => {
  it("never writes by default", async () => {
    const client = new ActiwhereClient(config());
    await expect(client.createEvents([event()])).rejects.toBeInstanceOf(CrmWriteBlockedError);
    expect(mock.state.requests).toHaveLength(0); // not even a login
  });

  it("in preview mode validates but creates nothing", async () => {
    const client = new ActiwhereClient(config({ writes: "preview" }));
    const result = await client.createEvents([event()]);
    expect(result.preview).toBe(true);
    expect(result.results[0]?.id).toBeDefined();
    expect(mock.state.createdEvents).toHaveLength(0);
  });

  it("in preview mode still reports validation errors", async () => {
    const client = new ActiwhereClient(config({ writes: "preview" }));
    const error = (await client
      .createEvents([event({ subject: "" })])
      .catch((e: unknown) => e)) as ActiwhereWriteError;
    expect(error).toBeInstanceOf(ActiwhereWriteError);
    expect(error.entries[0]?.details).toEqual([{ field: "subject", description: "required" }]);
  });

  it("creates events for real only when writes are on in a test environment", async () => {
    const client = new ActiwhereClient(config({ writes: "on" }));
    const result = await client.createEvents([event(), event({ subject: "Druhý záznam" })]);
    expect(result.preview).toBe(false);
    expect(result.results.map((r) => r.requestId)).toEqual([1, 2]);
    expect(mock.state.createdEvents).toHaveLength(2);
  });

  it("keeps real writes to a production CRM locked until explicitly unlocked", async () => {
    const locked = new ActiwhereClient(config({ environment: "production", writes: "on" }));
    await expect(locked.createEvents([event()])).rejects.toThrow(/ŽIVÉHO CRM/);
    const wrong = new ActiwhereClient(
      config({ environment: "production", writes: "on", productionWriteUnlock: "ano" }),
    );
    await expect(wrong.createEvents([event()])).rejects.toBeInstanceOf(CrmWriteBlockedError);
    expect(mock.state.createdEvents).toHaveLength(0);
    const unlocked = new ActiwhereClient(
      config({
        environment: "production",
        writes: "on",
        productionWriteUnlock: UNLOCK_PRODUCTION_WRITES,
      }),
    );
    await unlocked.createEvents([event()]);
    expect(mock.state.createdEvents).toHaveLength(1);
  });

  it("allows preview against a production CRM (nothing is created)", async () => {
    const client = new ActiwhereClient(config({ environment: "production", writes: "preview" }));
    await client.createEvents([event()]);
    expect(mock.state.createdEvents).toHaveLength(0);
  });

  it("only sends writes on the allowed list", async () => {
    const client = new ActiwhereClient(config({ writes: "on", writableEndpoints: [] }));
    await expect(client.createEvents([event()])).rejects.toThrow(/nie je povolený/);
  });

  it("refuses an empty write", async () => {
    const client = new ActiwhereClient(config({ writes: "on" }));
    await expect(client.createEvents([])).rejects.toBeInstanceOf(CrmWriteBlockedError);
  });

  it("rolls everything back when one entry is invalid", async () => {
    const client = new ActiwhereClient(config({ writes: "on" }));
    const error = (await client
      .createEvents([event(), event({ categoryId: 999 })])
      .catch((e: unknown) => e)) as ActiwhereWriteError;
    expect(error).toBeInstanceOf(ActiwhereWriteError);
    expect(error.message).toContain("categoryId invalid");
    expect(mock.state.createdEvents).toHaveLength(0);
  });

  it("rejects a repeated call id, so a retry cannot create duplicates", async () => {
    const client = new ActiwhereClient(config({ writes: "on" }));
    await client.createEvents([event()], { id: "uloha-48213-email-1" });
    const error = (await client
      .createEvents([event()], { id: "uloha-48213-email-1" })
      .catch((e: unknown) => e)) as ActiwhereError;
    expect(error).toBeInstanceOf(ActiwhereError);
    expect(error.code).toBe("03");
    expect(mock.state.createdEvents).toHaveLength(1);
  });
});

describe("logging", () => {
  it("reports each call without credentials, session ids or bodies", async () => {
    const log: RequestLogEntry[] = [];
    const client = new ActiwhereClient(
      config({ writes: "preview", password: MOCK_CREDENTIALS.password }),
      { onRequest: (e) => log.push(e) },
    );
    await client.read("customers");
    await client.createEvents([event({ subject: "Tajný predmet" })]);
    const text = JSON.stringify(log);
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain(MOCK_CREDENTIALS.password);
    expect(text).not.toContain(MOCK_CREDENTIALS.key);
    expect(text).not.toContain("SESSION-");
    expect(text).not.toContain("Tajný predmet");
    expect(log.at(-1)).toMatchObject({
      method: "POST",
      endpoint: "/events",
      preview: true,
      environment: "test",
    });
  });
});
