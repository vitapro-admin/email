import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationError, migrate } from "./migrate.js";
import {
  EnvironmentMismatchError,
  contentHash,
  countActive,
  ensureEnvironment,
  getRecords,
  markMissingAsRemoved,
  recordCrmRequest,
  recordSyncRun,
  stableStringify,
  upsertRecords,
} from "./mirror.js";
import { createTestDb, TEST_DATABASE_URL } from "./test-helpers.js";
import { withTransaction } from "./pool.js";
import type { Db } from "./pool.js";

describe("stable hashing (no database needed)", () => {
  it("ignores key order but not content", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe.skipIf(!TEST_DATABASE_URL)("PostgreSQL", () => {
  let db: Db;
  let drop: () => Promise<void>;

  beforeEach(async () => {
    ({ db, drop } = await createTestDb());
  });
  afterEach(async () => {
    await drop();
  });

  describe("migrations", () => {
    it("creates the schema and is a no-op the second time", async () => {
      const first = await migrate(db);
      expect(first.applied).toEqual(["001_crm_mirror", "002_directory", "003_tasks"]);
      const tables = await db.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = current_schema() order by 1",
      );
      expect(tables.rows.map((t) => t.table_name)).toEqual([
        "app_settings",
        "audit_log",
        "branches",
        "crm_records",
        "crm_request_log",
        "crm_sync_runs",
        "departments",
        "role_permissions",
        "roles",
        "schema_migrations",
        "tasks",
        "user_photos",
        "user_roles",
        "users",
      ]);
      expect((await migrate(db)).applied).toEqual([]);
    });

    it("refuses to continue when an applied migration was edited", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mig-"));
      writeFileSync(join(dir, "001_a.sql"), "create table a (id int);");
      await migrate(db, dir);
      writeFileSync(join(dir, "001_a.sql"), "create table a (id int, extra text);");
      writeFileSync(join(dir, "002_b.sql"), "create table b (id int);");
      await expect(migrate(db, dir)).rejects.toBeInstanceOf(MigrationError);
      const exists = await db.query("select to_regclass('b') as t");
      expect(exists.rows[0]).toEqual({ t: null }); // nothing after the broken one ran
    });

    it("rolls a failing migration back completely and reports which one", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mig-"));
      writeFileSync(join(dir, "001_ok.sql"), "create table ok (id int);");
      writeFileSync(
        join(dir, "002_bad.sql"),
        "create table half (id int); select nonexistent_function();",
      );
      await expect(migrate(db, dir)).rejects.toThrow(/002_bad/);
      expect((await db.query("select to_regclass('half') as t")).rows[0]).toEqual({ t: null });
      expect((await db.query("select to_regclass('ok') as t")).rows[0]).not.toEqual({ t: null }); // earlier one stays
      writeFileSync(join(dir, "002_bad.sql"), "create table fixed (id int);");
      // The failed file changed before it was ever applied, which is allowed.
      expect((await migrate(db, dir)).applied).toEqual(["002_bad"]);
    });

    it("applies each migration once even when two instances start together", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mig-"));
      writeFileSync(join(dir, "001_a.sql"), "create table a (id int);");
      const results = await Promise.all([migrate(db, dir), migrate(db, dir), migrate(db, dir)]);
      expect(results.flatMap((r) => r.applied)).toEqual(["001_a"]);
    });

    it("rejects two migrations with the same number", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mig-"));
      writeFileSync(join(dir, "001_a.sql"), "select 1;");
      writeFileSync(join(dir, "001_b.sql"), "select 2;");
      await expect(migrate(db, dir)).rejects.toThrow(/rovnaké číslo/);
    });
  });

  describe("mirror", () => {
    beforeEach(async () => {
      await migrate(db);
    });

    it("counts inserted, updated and unchanged records", async () => {
      const a = { crmId: "1", data: { customerId: 1, name: "A" } };
      const b = { crmId: "2", data: { customerId: 2, name: "B" } };
      expect(await upsertRecords(db, "customers", [a, b])).toEqual({
        inserted: 2,
        updated: 0,
        unchanged: 0,
      });
      expect(
        await upsertRecords(db, "customers", [a, { ...b, data: { customerId: 2, name: "B2" } }]),
      ).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
      expect((await getRecords(db, "customers")).map((r) => r.data["name"])).toEqual(["A", "B2"]);
    });

    it("treats a different key order as unchanged", async () => {
      await upsertRecords(db, "customers", [{ crmId: "1", data: { a: 1, b: 2 } }]);
      expect(await upsertRecords(db, "customers", [{ crmId: "1", data: { b: 2, a: 1 } }])).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 1,
      });
    });

    it("keeps the same id separate per entity", async () => {
      await upsertRecords(db, "customers", [{ crmId: "1", data: { x: 1 } }]);
      await upsertRecords(db, "events", [{ crmId: "1", data: { y: 2 } }]);
      expect(await countActive(db, "customers")).toBe(1);
      expect((await getRecords(db, "events"))[0]?.data).toEqual({ y: 2 });
    });

    it("stores awkward JSON faithfully (unicode, nested, null)", async () => {
      const data = {
        name: "Žilina – Ľudovít 😀",
        nested: { list: [1, "dva", null], ok: true },
        empty: null,
      };
      await upsertRecords(db, "customers", [{ crmId: "9", data }]);
      expect((await getRecords(db, "customers"))[0]?.data).toEqual(data);
    });

    it("marks records the CRM no longer returns, keeps them, and restores them if they come back", async () => {
      await withTransaction(db, async (tx) => {
        await upsertRecords(tx, "customers", [
          { crmId: "1", data: { n: 1 } },
          { crmId: "2", data: { n: 2 } },
        ]);
      });
      await new Promise((r) => setTimeout(r, 20));
      const removed = await withTransaction(db, async (tx) => {
        await upsertRecords(tx, "customers", [{ crmId: "1", data: { n: 1 } }]);
        return markMissingAsRemoved(tx, "customers");
      });
      expect(removed).toBe(1);
      expect(await countActive(db, "customers")).toBe(1);
      const all = await getRecords(db, "customers", { includeRemoved: true });
      expect(all.find((r) => r.crmId === "2")?.removedAt).toBeInstanceOf(Date);

      await new Promise((r) => setTimeout(r, 20));
      const counts = await withTransaction(db, (tx) =>
        upsertRecords(tx, "customers", [
          { crmId: "1", data: { n: 1 } },
          { crmId: "2", data: { n: 2 } },
        ]),
      );
      expect(counts).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
      expect(await countActive(db, "customers")).toBe(2);
    });

    it("never mixes CRM environments in one database", async () => {
      await ensureEnvironment(db, "test");
      await ensureEnvironment(db, "test");
      await expect(ensureEnvironment(db, "production")).rejects.toBeInstanceOf(
        EnvironmentMismatchError,
      );
    });

    it("records sync runs and request logs", async () => {
      await recordSyncRun(db, {
        entity: "customers",
        environment: "test",
        status: "ok",
        fetched: 3,
        inserted: 3,
        updated: 0,
        unchanged: 0,
        removed: 0,
      });
      await recordSyncRun(db, {
        entity: "customers",
        environment: "test",
        status: "failed",
        fetched: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
        error: "chyba",
      });
      await recordCrmRequest(db, {
        method: "GET",
        endpoint: "/customers",
        status: 200,
        durationMs: 12.6,
        preview: false,
        environment: "test",
      });
      const runs = await db.query<{ status: string; error: string | null }>(
        "select status, error from crm_sync_runs order by id",
      );
      expect(runs.rows).toEqual([
        { status: "ok", error: null },
        { status: "failed", error: "chyba" },
      ]);
      expect((await db.query("select duration_ms from crm_request_log")).rows[0]).toEqual({
        duration_ms: 13,
      });
    });
  });
});
