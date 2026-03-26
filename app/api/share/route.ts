import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getSharesDir } from "@/lib/shares-dir";

export interface ViewIndexEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function indexPath() {
  return join(getSharesDir(), "index.json");
}

export function readIndex(): ViewIndexEntry[] {
  const p = indexPath();
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}

export function writeIndex(entries: ViewIndexEntry[]) {
  writeFileSync(indexPath(), JSON.stringify(entries), "utf8");
}

// GET /api/share — list all saved views
export async function GET() {
  try {
    return NextResponse.json(readIndex());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/share — create a new saved view
export async function POST(req: NextRequest) {
  try {
    const { layers, basemap, name } = await req.json();
    if (!Array.isArray(layers) || layers.length === 0)
      return NextResponse.json({ error: "No layers to share" }, { status: 400 });

    const dir = getSharesDir();
    const id = randomBytes(8).toString("base64url");
    const now = new Date().toISOString();
    const config = { layers, basemap: basemap ?? "liberty", createdAt: now };
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(config), "utf8");

    const index = readIndex();
    index.push({ id, name: (name ?? "Untitled View").trim() || "Untitled View", createdAt: now, updatedAt: now });
    writeIndex(index);

    return NextResponse.json({ id });
  } catch (e: any) {
    console.error("[share POST]", e.message);
    return NextResponse.json({ error: e.message ?? "Failed to create view" }, { status: 500 });
  }
}
