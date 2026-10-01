import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReleaseManifest } from "@/lib/offline/schema";
import { packageFilename, packageIndex, planZip, type ZipPlan } from "@/lib/offline/package";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

let dir: string;

function makeRelease(): ReleaseManifest {
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue.sqlite"), Buffer.from("SQLite format 3\0 catalogue"));
  fs.writeFileSync(path.join(dir, "assets", `${SHA_A}.mp4`), Buffer.alloc(70_000, 7));
  fs.writeFileSync(path.join(dir, "assets", `${SHA_B}.jpg`), Buffer.from("jpeg bytes"));
  const manifest: ReleaseManifest = {
    format: "skillslab-content",
    package_schema_version: 1,
    content_schema_version: 1,
    release_id: "1700000000000-abcd1234",
    release_version: "1.4.0",
    created_at: "2026-09-30T10:20:30.000Z",
    catalogue: { filename: "catalogue.sqlite", bytes: 26, sha256: "c".repeat(64) },
    assets: [
      { media_id: 1, path: `assets/${SHA_A}.mp4`, mime: "video/mp4", bytes: 70_000, sha256: SHA_A },
      { media_id: 2, path: `assets/${SHA_B}.jpg`, mime: "image/jpeg", bytes: 10, sha256: SHA_B },
      // Two media items with identical content share one asset file.
      { media_id: 3, path: `assets/${SHA_B}.jpg`, mime: "image/jpeg", bytes: 10, sha256: SHA_B },
    ],
    total_uncompressed_bytes: 70_036,
    counts: { groups: 1, categories: 1, skills: 1, resources: 3, assets: 3 },
    min_app_content_schema_version: 1,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}

function assemble(plan: ZipPlan): Buffer {
  const zip = Buffer.concat(plan.parts.map((p) => (Buffer.isBuffer(p) ? p : fs.readFileSync(p.file))));
  expect(zip.length).toBe(plan.totalBytes);
  return zip;
}

/** An independent reader: end record (and ZIP64 records), central
 *  directory, then each local header and its stored data. */
function readZip(zip: Buffer): { zip64: boolean; entries: Map<string, Buffer> } {
  const eocd = zip.length - 22;
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
  let count = zip.readUInt16LE(eocd + 10);
  let cdOffset = zip.readUInt32LE(eocd + 16);
  const zip64 = eocd >= 20 && zip.readUInt32LE(eocd - 20) === 0x07064b50;
  if (zip64) {
    const record = Number(zip.readBigUInt64LE(eocd - 20 + 8));
    expect(zip.readUInt32LE(record)).toBe(0x06064b50);
    count = Number(zip.readBigUInt64LE(record + 32));
    cdOffset = Number(zip.readBigUInt64LE(record + 48));
  }

  const entries = new Map<string, Buffer>();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(p + 16);
    let size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    let local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf-8", p + 46, p + 46 + nameLen);
    const extra = zip.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    if (extra.length) {
      expect(extra.readUInt16LE(0)).toBe(0x0001);
      let q = 4;
      if (size === 0xffffffff) {
        size = Number(extra.readBigUInt64LE(q));
        q += 16; // uncompressed, then compressed
      }
      if (local === 0xffffffff) local = Number(extra.readBigUInt64LE(q));
    }
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    expect(zip.readUInt16LE(local + 8)).toBe(0); // stored
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    expect(zlib.crc32(data) >>> 0).toBe(crc);
    entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { zip64, entries };
}

describe("offline package", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-package-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("packs the manifest, catalogue and each asset once", () => {
    const manifest = makeRelease();
    const files = packageIndex(dir, manifest);
    expect(files.map((f) => f.name)).toEqual([
      "manifest.json",
      "catalogue.sqlite",
      `assets/${SHA_A}.mp4`,
      `assets/${SHA_B}.jpg`,
    ]);

    const { zip64, entries } = readZip(assemble(planZip(dir, files, new Date(manifest.created_at))));
    expect(zip64).toBe(false);
    expect(entries.size).toBe(4);
    for (const f of files) {
      expect(entries.get(f.name)!.equals(fs.readFileSync(path.join(dir, f.name)))).toBe(true);
    }
  });

  it("writes readable ZIP64 records when sizes or offsets pass the limit", () => {
    const manifest = makeRelease();
    const files = packageIndex(dir, manifest);
    // A threshold of 0 marks every size and offset as too big for 32 bits.
    const { zip64, entries } = readZip(assemble(planZip(dir, files, new Date(), 0)));
    expect(zip64).toBe(true);
    expect([...entries.keys()]).toEqual(files.map((f) => f.name));
    expect(entries.get(`assets/${SHA_A}.mp4`)!.length).toBe(70_000);
  });

  it("caches checksums, and redoes a file that changed after signing", () => {
    const manifest = makeRelease();
    const first = packageIndex(dir, manifest);
    expect(fs.existsSync(path.join(dir, ".package-index.json"))).toBe(true);
    expect(packageIndex(dir, manifest)).toEqual(first);

    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, signature: "c2ln" }));
    const after = packageIndex(dir, manifest);
    const before = first.find((f) => f.name === "manifest.json")!;
    const now = after.find((f) => f.name === "manifest.json")!;
    expect(now.size).not.toBe(before.size);
    expect(now.crc32).toBe(zlib.crc32(fs.readFileSync(path.join(dir, "manifest.json"))));
  });

  it("refuses asset paths outside the release", () => {
    const manifest = makeRelease();
    manifest.assets.push({ media_id: 9, path: "../outside.txt", mime: "text/plain", bytes: 1, sha256: SHA_A });
    expect(() => packageIndex(dir, manifest)).toThrow("Invalid package path");
  });

  it("names the file after the version", () => {
    const manifest = makeRelease();
    expect(packageFilename(manifest)).toBe("skillslab-v1.4.0.skillslab");
    expect(packageFilename({ ...manifest, release_version: 'Term 2 "final"' })).toBe("skillslab-vTerm-2-final.skillslab");
  });
});
