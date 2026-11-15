import { describe, it, expect, vi, afterEach } from "vitest";

async function healthWith(getDb: () => unknown) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ getDb }));
  const { GET } = await import("@/app/api/health/route");
  return GET();
}

describe("GET /api/health", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.resetModules();
  });

  it("answers ok when the database responds", async () => {
    const res = await healthWith(() => ({ prepare: () => ({ get: () => ({ 1: 1 }) }) }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 without details when it doesn't", async () => {
    const res = await healthWith(() => {
      throw new Error("SQLITE_CANTOPEN: /app/data/app.db");
    });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("unavailable");
  });
});
