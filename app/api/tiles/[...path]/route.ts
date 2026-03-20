import { NextRequest, NextResponse } from "next/server";

const MARTIN_URL = "http://127.0.0.1:3001";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const martinReqUrl = `${MARTIN_URL}/${path.join("/")}`;

  try {
    const resp = await fetch(martinReqUrl);
    if (!resp.ok) return new NextResponse(null, { status: resp.status });
    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          resp.headers.get("Content-Type") ??
          "application/vnd.mapbox-vector-tile",
      },
    });
  } catch {
    return NextResponse.json({ error: "Martin unavailable" }, { status: 502 });
  }
}
