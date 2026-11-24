import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/access-request",
  // Public marketing pages (app/(site)), statically rendered.
  "/",
  "/privacy",
  "/terms",
  "/design-lab",
]);

// Generated metadata images have no file extension, so the matcher's dot-file
// exclusion does not cover them.
const PUBLIC_PREFIXES = ["/opengraph-image", "/twitter-image"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("kord_access_token")?.value;
  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
