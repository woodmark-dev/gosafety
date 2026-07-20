import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as {
  pool?: Pool;
};

export function getDbPool() {
  if (globalForDb.pool) {
    return globalForDb.pool;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use the PostgreSQL database");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10000,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pool = pool;
  }

  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return getDbPool().query<T>(text, params);
}

export async function dbTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDbPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
