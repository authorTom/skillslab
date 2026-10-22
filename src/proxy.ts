import { NextResponse, type NextRequest } from "next/server";

/*
 * A quick first check on admin pages: no session cookie, no admin page. It
 * only looks for the cookie; whether the session is real, and what the
 * account may do, is checked by requireUser/requireRole in every page and
 * action. Keep the name in step with SESSION_COOKIE in lib/auth.ts.
 */

const SESSION_COOKIE = "skillslab_session";
const PUBLIC_PATHS = new Set(["/admin/login", "/admin/setup"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
