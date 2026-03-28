import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "pgf_session";

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "pgf-salt");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always public
  if (
    pathname.startsWith("/api/pg/tiles") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/login") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await hashPassword(password);

  if (session === expected) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/map/:path*", "/api/:path*"],
};
