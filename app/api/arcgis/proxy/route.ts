import { NextRequest, NextResponse } from "next/server";

// Proxy ArcGIS Feature Server requests server-side to avoid browser CORS restrictions.
export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string")
    return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Only allow ArcGIS / public HTTPS endpoints
  if (!url.startsWith("https://"))
    return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 400 });

  try {
    const upstream = await fetch(url, {
      headers: { "Accept": "application/json, application/geo+json" },
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    // Stream the body directly — avoids buffering large GeoJSON in the serverless function
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Proxy fetch failed" }, { status: 502 });
  }
}
