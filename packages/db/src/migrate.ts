import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./pool.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir)
    .filter((f) => /^\d{3,}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const migrations = files.map((file) => {
    const sql = readFileSync(join(dir, file), "utf8");
    const [version = "", ...rest] = file.replace(/\.sql$/, "").split("_");
    return {
      version,
      name: rest.join("_"),
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  });
  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.version))
      throw new MigrationError(`Dve migrácie majú rovnaké číslo ${m.version}.`);
    seen.add(m.version);
  }
  return migrations;
}

// A fixed number so two instances starting at once cannot migrate at the same time.
const LOCK_KEY = 727_001;

/**
 * Applies migrations that are not applied yet, each in its own transaction, in order.
 * An already applied migration must never change: if its file differs, nothing is run.
 */
export async function migrate(
  db: Db,
  dir: string = MIGRATIONS_DIR,
): Promise<{ applied: string[] }> {
  const migrations = loadMigrations(dir);
  const client = await db.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`create table if not exists schema_migrations (
      version text primary key, name text not null, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map(
      (
        await client.query<{ version: string; checksum: string }>(
          "select version, checksum from schema_migrations",
        )
      ).rows.map((r) => [r.version, r.checksum] as const),
    );
    for (const m of migrations) {
      const existing = done.get(m.version);
      if (existing !== undefined && existing !== m.checksum) {
        throw new MigrationError(
          `Migrácia ${m.version}_${m.name} sa po nasadení zmenila. Pridajte novú migráciu namiesto úpravy starej.`,
        );
      }
    }
    const applied: string[] = [];
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query(
          "insert into schema_migrations (version, name, checksum) values ($1, $2, $3)",
          [m.version, m.name, m.checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw new MigrationError(
          `Migrácia ${m.version}_${m.name} zlyhala: ${(error as Error).message}`,
        );
      }
      applied.push(`${m.version}_${m.name}`);
    }
    return { applied };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
