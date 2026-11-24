import { randomBytes } from "node:crypto";
import pg from "pg";
import { createPool } from "./pool.js";
import type { Db } from "./pool.js";

/** Tests run only when TEST_DATABASE_URL points at a real PostgreSQL. */
export const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"];

/** A private schema per test, so tests never see each other's data. Call `drop()` afterwards. */
export async function createTestDb(): Promise<{ db: Db; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL nie je nastavená.");
  const schema = `t_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  const db = createPool({ databaseUrl: TEST_DATABASE_URL, searchPath: schema });
  return {
    db,
    drop: async () => {
      await db.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}
