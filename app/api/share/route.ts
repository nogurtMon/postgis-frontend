import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const SHARES_DIR = join(process.cwd(), "data", "shares");

function ensureDir() {
  if (!existsSync(SHARES_DIR)) mkdirSync(SHARES_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { layers, basemap } = body;
  if (!Array.isArray(layers) || layers.length === 0)
    return NextResponse.json({ error: "No layers to share" }, { status: 400 });

  ensureDir();
  const id = randomBytes(8).toString("base64url");
  const config = {
    layers,
    basemap: basemap ?? "liberty",
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(SHARES_DIR, `${id}.json`), JSON.stringify(config), "utf8");
  return NextResponse.json({ id });
}
