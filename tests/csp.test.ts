import { describe, it, expect } from "vitest";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";
import { proxy, config } from "@/proxy";
import { NextRequest } from "next/server";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy("abc123", false);

  it("only runs scripts carrying the request's nonce, without eval in production", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'nonce-abc123'");
  });

  it("allows eval and inline styles only in development", () => {
    const dev = contentSecurityPolicy("abc123", true);
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "style-src")).toContain("'unsafe-inline'");
  });

  it("frames Vimeo's player and the app's own PDFs, and is framed only by itself", () => {
    expect(directive(csp, "frame-src")).toBe("frame-src 'self' https://player.vimeo.com");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });

  it("makes a different, unguessable nonce each time", () => {
    const a = createNonce();
    expect(a).not.toBe(createNonce());
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});

describe("proxy", () => {
  const run = (path: string, cookie?: string) =>
    proxy(new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined));

  it("sends a nonce CSP on pages, fresh per request", () => {
    const a = run("/").headers.get("content-security-policy");
    const b = run("/").headers.get("content-security-policy");
    expect(a).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(a).not.toBe(b);
  });

  it("still sends signed-out visitors from admin pages to the login page", () => {
    const res = run("/admin/users");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/admin/login");
    expect(run("/admin/login").status).toBe(200);
    expect(run("/admin", "skillslab_session=x").status).toBe(200);
  });

  it("skips Server Action calls, whose upload bodies it would otherwise buffer and cut short", () => {
    expect(config.matcher[0].missing).toEqual([{ type: "header", key: "next-action" }]);
  });

  it("leaves /files, the offline API and build assets alone", () => {
    const matcher = new RegExp(`^${config.matcher[0].source.replace("/(", "/(?:")}$`);
    expect(matcher.test("/skills/venepuncture")).toBe(true);
    expect(matcher.test("/admin/releases")).toBe(true);
    expect(matcher.test("/files/1/guide.pdf")).toBe(false);
    expect(matcher.test("/api/offline/releases/latest")).toBe(false);
    expect(matcher.test("/_next/static/chunks/main.js")).toBe(false);
  });
});
