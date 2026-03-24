import { NextRequest, NextResponse } from "next/server";
import { encryptDsn } from "@/lib/dsn-token";

export async function POST(req: NextRequest) {
  const { dsn } = await req.json();
  if (!dsn?.startsWith("postgres")) {
    return NextResponse.json({ error: "Invalid DSN" }, { status: 400 });
  }
  const token = encryptDsn(dsn);
  return NextResponse.json({ token });
}
