import { Pool } from "pg";

const pools = new Map<string, Pool>();

export function getPool(dsn: string): Pool {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}
