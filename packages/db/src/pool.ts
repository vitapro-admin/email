import pg from "pg";

/** The small part of a database connection the app uses. Pool, client and transaction satisfy it. */
export interface Queryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export type Db = pg.Pool;

export interface PoolOptions {
  databaseUrl: string;
  /** Used by tests to work in a private schema. */
  searchPath?: string;
  max?: number;
}

export function createPool(options: PoolOptions): Db {
  return new pg.Pool({
    connectionString: options.databaseUrl,
    max: options.max ?? 5,
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  });
}

/** Runs `work` in one transaction. Commits on success, rolls back on any error. */
export async function withTransaction<T>(db: Db, work: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
