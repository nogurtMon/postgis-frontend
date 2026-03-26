import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function tryDir(dir: string): string | null {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Verify it's actually writable
    const probe = join(dir, ".write-probe");
    writeFileSync(probe, "");
    return dir;
  } catch {
    return null;
  }
}

let _resolved: string | null = null;

export function getSharesDir(): string {
  if (_resolved) return _resolved;
  _resolved =
    tryDir(join(process.cwd(), "data", "shares")) ??
    tryDir(join(tmpdir(), "postgis-shares")) ??
    null;
  if (!_resolved) throw new Error("No writable directory available for shares");
  return _resolved;
}
