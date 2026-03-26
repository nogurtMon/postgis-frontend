import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getSharesDir } from "@/lib/shares-dir";
import { readIndex, writeIndex } from "@/app/api/share/route";

function safeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id);
}

// GET /api/share/[id] — load a saved view
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!safeId(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const filePath = join(getSharesDir(), `${id}.json`);
    if (!existsSync(filePath))
      return NextResponse.json({ error: "Share not found" }, { status: 404 });

    return NextResponse.json(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/share/[id] — update an existing saved view with current map state
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!safeId(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const filePath = join(getSharesDir(), `${id}.json`);
    if (!existsSync(filePath))
      return NextResponse.json({ error: "Share not found" }, { status: 404 });

    const { layers, basemap } = await req.json();
    if (!Array.isArray(layers) || layers.length === 0)
      return NextResponse.json({ error: "No layers provided" }, { status: 400 });

    const existing = JSON.parse(readFileSync(filePath, "utf8"));
    const now = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify({ ...existing, layers, basemap: basemap ?? "liberty", updatedAt: now }), "utf8");

    const index = readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) { entry.updatedAt = now; writeIndex(index); }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/share/[id] — remove a saved view
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!safeId(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const filePath = join(getSharesDir(), `${id}.json`);
    if (existsSync(filePath)) unlinkSync(filePath);

    writeIndex(readIndex().filter((e) => e.id !== id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
