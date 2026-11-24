import type {
  ActiwhereClient,
  JsonObject,
  ReadEndpoint,
  ReadRequest,
} from "@aquapro/crm-connector";
import {
  countActive,
  ensureEnvironment,
  markMissingAsRemoved,
  recordSyncRun,
  upsertRecords,
  withTransaction,
} from "@aquapro/db";
import type { Db, MirrorInput } from "@aquapro/db";

export interface EntitySpec {
  /** Name the records are stored under in the mirror. */
  entity: string;
  endpoint: ReadEndpoint;
  /** Named key the list arrives under in the answer, for example "customers". */
  key: string;
  /** Property that identifies a record. Records without it are an error: we never guess. */
  idField: string;
  request?: Omit<ReadRequest, "paging">;
  pageSize?: number;
}

export interface SyncResult {
  entity: string;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
}

export class SyncError extends Error {
  constructor(
    readonly code:
      "writable-client" | "missing-id" | "duplicate-id" | "too-many-removed" | "read-failed",
    message: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

export interface SyncOptions {
  /**
   * Safety net against a broken or empty answer wiping the mirror: if more than this share of the
   * existing records (and more than 10) would be marked removed, the run is refused.
   */
  maxRemovedShare?: number;
  allowMassRemoval?: boolean;
}

function idOf(record: JsonObject, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/**
 * Copies one list from the CRM into the mirror. READ-ONLY toward the CRM: a client that is allowed
 * to write is refused. The whole list is read first; the mirror changes in one transaction only if
 * the read was complete, so a failure halfway leaves the previous data untouched.
 */
export async function syncEntity(
  client: ActiwhereClient,
  db: Db,
  spec: EntitySpec,
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (client.writeMode !== "off") {
    throw new SyncError(
      "writable-client",
      "Synchronizácia vyžaduje klienta bez práva zápisu (writes = off).",
    );
  }
  const environment = client.environment;
  const startedAt = new Date();
  const result: SyncResult = {
    entity: spec.entity,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
  };

  const fail = async (error: unknown): Promise<never> => {
    await recordSyncRun(db, {
      ...result,
      environment,
      status: "failed",
      error: (error as Error).message,
      startedAt,
    }).catch(() => undefined);
    throw error;
  };

  let rows: JsonObject[];
  try {
    rows = await client.readAll(spec.endpoint, spec.key, spec.request ?? {}, spec.pageSize ?? 1000);
  } catch (error) {
    return fail(new SyncError("read-failed", `Čítanie z CRM zlyhalo: ${(error as Error).message}`));
  }
  result.fetched = rows.length;

  const records: MirrorInput[] = [];
  const seen = new Set<string>();
  let missingId = 0;
  for (const row of rows) {
    const id = idOf(row, spec.idField);
    if (id === undefined) {
      missingId += 1;
    } else if (seen.has(id)) {
      return fail(new SyncError("duplicate-id", `V odpovedi sa „${spec.idField}“ ${id} opakuje.`));
    } else {
      seen.add(id);
      records.push({ crmId: id, data: row });
    }
  }
  if (missingId > 0) {
    return fail(
      new SyncError(
        "missing-id",
        `${missingId} záznamov nemá pole „${spec.idField}“. Skontrolujte mapovanie podľa skutočných ukážok.`,
      ),
    );
  }

  try {
    await withTransaction(db, async (tx) => {
      await ensureEnvironment(tx, environment);
      const before = await countActive(tx, spec.entity);
      const counts = await upsertRecords(tx, spec.entity, records);
      const removed = await markMissingAsRemoved(tx, spec.entity);

      const limit = options.maxRemovedShare ?? 0.5;
      if (!options.allowMassRemoval && removed > 10 && removed > before * limit) {
        throw new SyncError(
          "too-many-removed",
          `Synchronizácia by označila ${removed} z ${before} záznamov ako odstránené. Vyzerá to na chybu, nič sa nezmenilo.`,
        );
      }
      Object.assign(result, counts, { removed });
    });
  } catch (error) {
    return fail(error);
  }

  await recordSyncRun(db, { ...result, environment, status: "ok", startedAt });
  return result;
}
