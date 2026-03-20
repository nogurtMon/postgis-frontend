import { NextResponse } from "next/server";

const MARTIN_URL = "http://127.0.0.1:3001";

export async function GET() {
  try {
    const res = await fetch(`${MARTIN_URL}/catalog`);
    if (!res.ok) return NextResponse.json({ tiles: {} });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ tiles: {} });
  }
}
