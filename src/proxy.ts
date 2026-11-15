import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";

/*
 * Runs before every page.
 *
 * 1. Content-Security-Policy with a per-request nonce. Next.js reads the nonce
 *    from the request header and applies it to its own scripts and styles.
 *
 * 2. A quick first check on admin pages: no session cookie, no admin page. It
 *    only looks for the cookie; whether the session is real, and what the
 *    account may do, is checked by requireUser/requireRole in every page and
 *    action. Keep the name in step with SESSION_COOKIE in lib/auth.ts.
 */

const SESSION_COOKIE = "skillslab_session";
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/setup"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin && !PUBLIC_ADMIN_PATHS.has(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const csp = contentSecurityPolicy(createNonce(), process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      /*
       * Every page. Skipped: build assets, the favicon, the offline API (JSON
       * and release files for the iPad) and /files, which sets its own policy
       * per file type.
       */
      source: "/((?!_next/static|_next/image|favicon.ico|api/|files/).*)",
      /*
       * And Server Action calls. Next buffers the body of every request the
       * proxy sees, which would cut uploads short (and hold them in memory
       * twice); actions check the session themselves, and their responses
       * aren't pages that need a CSP.
       */
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
