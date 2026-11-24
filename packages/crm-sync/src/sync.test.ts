import { ActiwhereClient } from "@aquapro/crm-connector";
import { MOCK_CREDENTIALS, createMockActiwhere } from "@aquapro/crm-connector/mock";
import type { MockActiwhere } from "@aquapro/crm-connector/mock";
import { countActive, getRecords, migrate } from "@aquapro/db";
import type { Db } from "@aquapro/db";
import { createTestDb, TEST_DATABASE_URL } from "@aquapro/db/test-helpers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SPECS } from "./specs.js";
import { SyncError, syncEntity } from "./sync.js";
import type { EntitySpec } from "./sync.js";

const customersSpec = DEFAULT_SPECS[0] as EntitySpec;
const eventsSpec = DEFAULT_SPECS[1] as EntitySpec;

describe.skipIf(!TEST_DATABASE_URL)("CRM sync (fake Actiwhere + real PostgreSQL)", () => {
  let mock: MockActiwhere;
  let db: Db;
  let drop: () => Promise<void>;

  const client = (overrides: Partial<ConstructorParameters<typeof ActiwhereClient>[0]> = {}) =>
    new ActiwhereClient({
      baseUrl: mock.url,
      apiKey: MOCK_CREDENTIALS.key,
      username: MOCK_CREDENTIALS.username,
      password: MOCK_CREDENTIALS.password,
      environment: "test",
      ...overrides,
    });

  const runs = async () =>
    (
      await db.query<{
        entity: string;
        status: string;
        fetched: number;
        inserted: number;
        updated: number;
        unchanged: number;
        removed: number;
        error: string | null;
      }>(
        "select entity, status, fetched, inserted, updated, unchanged, removed, error from crm_sync_runs order by id",
      )
    ).rows;

  beforeEach(async () => {
    mock = await createMockActiwhere();
    ({ db, drop } = await createTestDb());
    await migrate(db);
  });
  afterEach(async () => {
    await mock.close();
    await drop();
  });

  it("copies customers with their contacts as raw JSON and records the run", async () => {
    const result = await syncEntity(client(), db, customersSpec);
    expect(result).toEqual({
      entity: "customers",
      fetched: 3,
      inserted: 3,
      updated: 0,
      unchanged: 0,
      removed: 0,
    });
    const stored = await getRecords(db, "customers");
    expect(stored.map((r) => r.crmId)).toEqual(["86858", "86859", "86860"]);
    const hotel = stored.find((r) => r.crmId === "86858")?.data as {
      contacts: { email: string }[];
    };
    expect(hotel.contacts[0]?.email).toBe("j.horvathova@hotelpanorama.example");
    expect(await runs()).toEqual([
      {
        entity: "customers",
        status: "ok",
        fetched: 3,
        inserted: 3,
        updated: 0,
        unchanged: 0,
        removed: 0,
        error: null,
      },
    ]);
  });

  it("is repeatable: a second run changes nothing", async () => {
    await syncEntity(client(), db, customersSpec);
    expect(await syncEntity(client(), db, customersSpec)).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 3,
      removed: 0,
    });
  });

  it("picks up changes, new records and removals made in the CRM", async () => {
    await syncEntity(client(), db, customersSpec);
    mock.state.data.customers[0]!["name"] = "Hotel Panoráma a.s.";
    mock.state.data.customers.pop();
    mock.state.data.customers.push({
      customerId: 99999,
      name: "Nový klient",
      statusId: 1,
      addresses: [],
      contacts: [],
      contracts: [],
    });
    const result = await syncEntity(client(), db, customersSpec);
    expect(result).toMatchObject({ fetched: 3, inserted: 1, updated: 1, unchanged: 1, removed: 1 });
    expect(await countActive(db, "customers")).toBe(3);
    const all = await getRecords(db, "customers", { includeRemoved: true });
    expect(all.find((r) => r.crmId === "86860")?.removedAt).toBeInstanceOf(Date); // kept, only marked
  });

  it("syncs several entities side by side", async () => {
    await syncEntity(client(), db, customersSpec);
    await syncEntity(client(), db, eventsSpec);
    expect(await countActive(db, "customers")).toBe(3);
    expect(await countActive(db, "events")).toBe(2);
  });

  it("reads every page when the list is longer than a page", async () => {
    const result = await syncEntity(client(), db, { ...customersSpec, pageSize: 2 });
    expect(result.fetched).toBe(3);
    expect(mock.state.requests.filter((r) => r.path.endsWith("/customers"))).toHaveLength(2);
  });

  it("leaves the previous data untouched when the read breaks halfway", async () => {
    await syncEntity(client(), db, customersSpec);
    mock.state.failFromPage = { endpoint: "customers", page: 2 };
    const error = (await syncEntity(client(), db, { ...customersSpec, pageSize: 2 }).catch(
      (e: unknown) => e,
    )) as SyncError;
    expect(error).toBeInstanceOf(SyncError);
    expect(error.code).toBe("read-failed");
    expect(await countActive(db, "customers")).toBe(3);
    const last = (await runs()).at(-1);
    expect(last).toMatchObject({ status: "failed" });
    expect(last?.error).toContain("Čítanie z CRM zlyhalo");
  });

  it("refuses records that lack the id field instead of guessing", async () => {
    const error = (await syncEntity(client(), db, { ...customersSpec, idField: "id" }).catch(
      (e: unknown) => e,
    )) as SyncError;
    expect(error.code).toBe("missing-id");
    expect(await countActive(db, "customers")).toBe(0);
  });

  it("refuses an answer where an id repeats", async () => {
    mock.state.data.customers.push({ ...mock.state.data.customers[0]! });
    const error = (await syncEntity(client(), db, customersSpec).catch(
      (e: unknown) => e,
    )) as SyncError;
    expect(error.code).toBe("duplicate-id");
    expect(await countActive(db, "customers")).toBe(0);
  });

  it("refuses to wipe the mirror when the CRM suddenly returns almost nothing", async () => {
    mock.state.data.orders.splice(0); // start clean
    for (let i = 0; i < 30; i++) mock.state.data.orders.push({ orderId: 5000 + i });
    const orders: EntitySpec = {
      entity: "orders",
      endpoint: "orders",
      key: "orders",
      idField: "orderId",
    };
    await syncEntity(client(), db, orders);
    expect(await countActive(db, "orders")).toBe(30);

    mock.state.data.orders.splice(2); // the CRM now returns only 2 of 30
    const error = (await syncEntity(client(), db, orders).catch((e: unknown) => e)) as SyncError;
    expect(error.code).toBe("too-many-removed");
    expect(await countActive(db, "orders")).toBe(30); // nothing changed
    expect((await runs()).at(-1)).toMatchObject({ status: "failed" });

    const forced = await syncEntity(client(), db, orders, { allowMassRemoval: true });
    expect(forced.removed).toBe(28);
  });

  it("refuses a client that is allowed to write", async () => {
    for (const writes of ["preview", "on"] as const) {
      const error = (await syncEntity(client({ writes }), db, customersSpec).catch(
        (e: unknown) => e,
      )) as SyncError;
      expect(error.code).toBe("writable-client");
    }
    expect(mock.state.requests).toHaveLength(0);
  });

  it("never lets test and live data share a database", async () => {
    await syncEntity(client(), db, customersSpec);
    const error = (await syncEntity(client({ environment: "production" }), db, customersSpec).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.name).toBe("EnvironmentMismatchError");
    expect(await countActive(db, "customers")).toBe(3);
  });

  it("only reads: nothing is ever written to the CRM", async () => {
    await syncEntity(client(), db, customersSpec);
    await syncEntity(client(), db, eventsSpec);
    expect(
      mock.state.requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/login")),
    ).toEqual([]);
    expect(mock.state.createdEvents).toEqual([]);
  });
});
