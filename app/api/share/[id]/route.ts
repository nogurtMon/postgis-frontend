import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SHARES_DIR = join(process.cwd(), "data", "shares");

// Prevent path traversal — only allow base64url chars
function safeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!safeId(id))
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const filePath = join(SHARES_DIR, `${id}.json`);
  if (!existsSync(filePath))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const config = JSON.parse(readFileSync(filePath, "utf8"));
  return NextResponse.json(config);
}
