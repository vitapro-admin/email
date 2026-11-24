import { createHash } from "node:crypto";
import type { Queryable } from "./pool.js";

export type CrmEnvironment = "test" | "production";
export type JsonObject = Record<string, unknown>;

/** JSON with keys in a fixed order, so the same content always gives the same hash. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as JsonObject)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const contentHash = (data: unknown): string =>
  createHash("sha256").update(stableStringify(data)).digest("hex");

/**
 * A database holds data from ONE CRM environment only. The first sync records it and every later
 * sync must match, so test data and live data can never end up mixed in the same database.
 */
export class EnvironmentMismatchError extends Error {
  constructor(recorded: string, requested: string) {
    super(
      `Táto databáza obsahuje údaje z prostredia „${recorded}“. Synchronizácia z prostredia „${requested}“ sa odmieta, aby sa údaje nepomiešali.`,
    );
    this.name = "EnvironmentMismatchError";
  }
}

export async function ensureEnvironment(db: Queryable, environment: CrmEnvironment): Promise<void> {
  await db.query(
    "insert into app_settings (key, value) values ('crm_environment', $1) on conflict (key) do nothing",
    [environment],
  );
  const { rows } = await db.query<{ value: string }>(
    "select value from app_settings where key = 'crm_environment'",
  );
  const recorded = rows[0]?.value;
  if (recorded !== environment) throw new EnvironmentMismatchError(recorded ?? "?", environment);
}

export interface MirrorInput {
  crmId: string;
  data: JsonObject;
}

export interface UpsertCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * Stores records. New ones are inserted, changed ones updated, identical ones only marked as seen.
 * A record that had been marked removed and returns is restored.
 */
export async function upsertRecords(
  db: Queryable,
  entity: string,
  records: MirrorInput[],
): Promise<UpsertCounts> {
  if (records.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
  const payload = JSON.stringify(
    records.map((r) => ({ id: r.crmId, data: r.data, hash: contentHash(r.data) })),
  );

  const changed = await db.query<{ inserted: boolean }>(
    `insert into crm_records (entity, crm_id, data, content_hash)
       select $1, r->>'id', r->'data', r->>'hash' from jsonb_array_elements($2::jsonb) as r
     on conflict (entity, crm_id) do update
       set data = excluded.data, content_hash = excluded.content_hash,
           updated_at = now(), last_seen_at = now(), removed_at = null
       where crm_records.content_hash <> excluded.content_hash or crm_records.removed_at is not null
     returning (xmax = 0) as inserted`,
    [entity, payload],
  );
  // Identical records are not touched by the statement above, so mark them as seen now.
  await db.query(
    `update crm_records set last_seen_at = now()
      where entity = $1 and crm_id = any($2::text[]) and last_seen_at < now()`,
    [entity, records.map((r) => r.crmId)],
  );
  const inserted = changed.rows.filter((r) => r.inserted).length;
  return {
    inserted,
    updated: changed.rows.length - inserted,
    unchanged: records.length - changed.rows.length,
  };
}

/** Marks records that the latest complete read did not return. They are kept, never deleted. */
export async function markMissingAsRemoved(db: Queryable, entity: string): Promise<number> {
  const result = await db.query(
    `update crm_records set removed_at = now()
      where entity = $1 and removed_at is null and last_seen_at < now()`,
    [entity],
  );
  return result.rowCount ?? 0;
}

export async function countActive(db: Queryable, entity: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    "select count(*) as n from crm_records where entity = $1 and removed_at is null",
    [entity],
  );
  return Number(rows[0]?.n ?? 0);
}

export interface StoredRecord {
  crmId: string;
  data: JsonObject;
  removedAt: Date | null;
}

export async function getRecords(
  db: Queryable,
  entity: string,
  options: { includeRemoved?: boolean } = {},
): Promise<StoredRecord[]> {
  const { rows } = await db.query<{ crm_id: string; data: JsonObject; removed_at: Date | null }>(
    `select crm_id, data, removed_at from crm_records where entity = $1 ${options.includeRemoved ? "" : "and removed_at is null"} order by crm_id`,
    [entity],
  );
  return rows.map((r) => ({ crmId: r.crm_id, data: r.data, removedAt: r.removed_at }));
}

export interface SyncRunInput {
  entity: string;
  environment: CrmEnvironment;
  status: "ok" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  error?: string;
  startedAt?: Date;
}

export async function recordSyncRun(db: Queryable, run: SyncRunInput): Promise<void> {
  await db.query(
    `insert into crm_sync_runs (entity, environment, started_at, finished_at, status, fetched, inserted, updated, unchanged, removed, error)
     values ($1, $2, coalesce($3, now()), now(), $4, $5, $6, $7, $8, $9, $10)`,
    [
      run.entity,
      run.environment,
      run.startedAt ?? null,
      run.status,
      run.fetched,
      run.inserted,
      run.updated,
      run.unchanged,
      run.removed,
      run.error ?? null,
    ],
  );
}

export async function recordCrmRequest(
  db: Queryable,
  entry: {
    method: string;
    endpoint: string;
    status: number;
    durationMs: number;
    preview: boolean;
    environment: CrmEnvironment;
  },
): Promise<void> {
  await db.query(
    "insert into crm_request_log (method, endpoint, status, duration_ms, preview, environment) values ($1, $2, $3, $4, $5, $6)",
    [
      entry.method,
      entry.endpoint,
      entry.status,
      Math.round(entry.durationMs),
      entry.preview,
      entry.environment,
    ],
  );
}
