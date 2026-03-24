import { decryptDsn } from "./dsn-token";

/**
 * Resolve an encrypted DSN token back to a raw postgres:// connection string.
 * All API routes call this instead of trusting the incoming `dsn` param directly.
 */
export function resolveDsn(token: string | null | undefined): string {
  if (!token) throw new Error("Missing token");
  try {
    const dsn = decryptDsn(token);
    if (!dsn.startsWith("postgres")) throw new Error("Bad token payload");
    return dsn;
  } catch {
    throw new Error("Invalid token");
  }
}
