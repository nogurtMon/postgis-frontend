import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

function getKey(): Buffer {
  if (process.env.DSN_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.DSN_ENCRYPTION_KEY, "hex");
    if (key.length !== 32) throw new Error("DSN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
    return key;
  }
  // Dev mode: persist a random key so it survives hot reloads
  const keyPath = join(process.cwd(), ".dsn-dev-key");
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf8").trim(), "hex");
  }
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("hex"), "utf8");
  return key;
}

const KEY = getKey();

export function encryptDsn(dsn: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(dsn, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptDsn(token: string): string {
  const buf = Buffer.from(token, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}
