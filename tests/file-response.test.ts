import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { parseRange, securityHeaders, SVG_CSP } from "@/lib/file-response";

describe("parseRange", () => {
  it("ignores a missing, malformed or multi-range header", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
  });

  it("reads explicit, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("clamps an end past the file to the last byte", () => {
    expect(parseRange("bytes=50-1000", 100)).toEqual({ start: 50, end: 99 });
  });

  it("rejects ranges that start past the end or run backwards", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=9-3", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});

describe("securityHeaders", () => {
  it("sends nosniff for every type", () => {
    for (const type of ["image/png", "application/pdf", "video/mp4", "image/svg+xml"]) {
      expect(securityHeaders(type)["X-Content-Type-Options"]).toBe("nosniff");
    }
  });

  it("sandboxes SVG but leaves PDFs viewable in the browser", () => {
    expect(securityHeaders("image/svg+xml")["Content-Security-Policy"]).toBe(SVG_CSP);
    expect(SVG_CSP).toContain("sandbox");
    expect(securityHeaders("application/pdf")["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("/files route", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-files-"));
  const db = new Database(":memory:");
  const pdf = Buffer.from("%PDF-1.4 " + "x".repeat(1000));
  let GET: typeof import("@/app/files/[...path]/route").GET;

  beforeAll(async () => {
    db.exec("CREATE TABLE media (id INTEGER PRIMARY KEY, storage_name TEXT, filename TEXT, mime TEXT)");
    db.prepare("INSERT INTO media VALUES (1, 'a1.pdf', 'Guide.pdf', 'application/pdf')").run();
    db.prepare("INSERT INTO media VALUES (2, 'b2.svg', 'Diagram.svg', 'image/svg+xml')").run();
    fs.writeFileSync(path.join(dir, "a1.pdf"), pdf);
    fs.writeFileSync(path.join(dir, "b2.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    fs.writeFileSync(path.join(dir, "legacy.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    vi.doMock("@/lib/db", () => ({ getDb: () => db, UPLOADS_DIR: dir }));
    ({ GET } = await import("@/app/files/[...path]/route"));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/db");
    vi.resetModules();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const get = (segments: string[], headers: Record<string, string> = {}) =>
    GET(new Request("http://localhost/files/" + segments.join("/"), { headers }), {
      params: Promise.resolve({ path: segments }),
    });

  it("streams a whole file with nosniff and no sandbox on PDFs", async () => {
    const res = await get(["1", "Guide.pdf"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(pdf.length));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(Buffer.from(await res.arrayBuffer()).equals(pdf)).toBe(true);
  });

  it("honours a Range request on a non-video type", async () => {
    const res = await get(["1", "Guide.pdf"], { range: "bytes=4-8" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 4-8/${pdf.length}`);
    expect(res.headers.get("content-length")).toBe("5");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(pdf.subarray(4, 9).toString());
  });

  it("answers an unsatisfiable range with 416", async () => {
    const res = await get(["1", "Guide.pdf"], { range: `bytes=${pdf.length}-` });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${pdf.length}`);
  });

  it("serves SVG under a sandboxing CSP", async () => {
    const res = await get(["2", "Diagram.svg"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(SVG_CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("still resolves an old single-segment bookmark by storage name", async () => {
    const byStorage = await get(["a1.pdf"]);
    expect(byStorage.status).toBe(200);
    const unregistered = await get(["legacy.png"]);
    expect(unregistered.status).toBe(200);
    expect(unregistered.headers.get("content-type")).toBe("image/png");
  });

  it("refuses paths outside the uploads directory", async () => {
    expect((await get(["..%2Fescape.png"])).status).toBe(404);
    expect((await get(["missing.png"])).status).toBe(404);
  });
});

describe("offline release download route", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-release-"));
  const asset = Buffer.alloc(4096, 7);
  let GET: typeof import("@/app/api/offline/releases/[id]/download/route").GET;

  beforeAll(async () => {
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "clip.mp4"), asset);
    vi.doMock("@/lib/offline/releases", () => ({
      getRelease: (id: string) => (id === "r1" ? { dir, manifest: { release_id: "r1" } } : null),
    }));
    ({ GET } = await import("@/app/api/offline/releases/[id]/download/route"));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/offline/releases");
    vi.resetModules();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const get = (id: string, file: string | null, headers: Record<string, string> = {}) =>
    GET(
      new Request(`http://localhost/api/offline/releases/${id}/download${file ? `?file=${file}` : ""}`, { headers }),
      { params: Promise.resolve({ id }) }
    );

  it("streams a release file with nosniff", async () => {
    const res = await get("r1", "assets/clip.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-length")).toBe("4096");
    expect((await res.arrayBuffer()).byteLength).toBe(4096);
  });

  it("honours Range so an interrupted download can resume", async () => {
    const res = await get("r1", "assets/clip.mp4", { range: "bytes=4000-" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 4000-4095/4096");
    expect((await res.arrayBuffer()).byteLength).toBe(96);
  });

  it("sends nosniff on the manifest and on errors", async () => {
    expect((await get("r1", null)).headers.get("x-content-type-options")).toBe("nosniff");
    const traversal = await get("r1", "../outside");
    expect(traversal.status).toBe(400);
    expect(traversal.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await get("nope", null)).status).toBe(404);
  });
});
