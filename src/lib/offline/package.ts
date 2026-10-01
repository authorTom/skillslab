import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { ReleaseManifest } from "./schema";

/**
 * A release as one downloadable file, for installing on iPads without a
 * network: copied to a USB drive, AirDropped, or saved in Files.
 *
 * It is an uncompressed (stored) zip. The media is already compressed, so
 * deflating would cost time for nothing, and with every size and CRC known up
 * front the archive's exact length is known before streaming starts, so
 * browsers show real progress. ZIP64 records are added only when an offset or
 * size passes 4 GB.
 */

export const PACKAGE_EXTENSION = ".skillslab";

const INDEX_FILE = ".package-index.json";
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

export interface PackageFile {
  /** Path inside the release directory, and the entry name in the zip. */
  name: string;
  size: number;
  crc32: number;
}

interface IndexEntry extends PackageFile {
  mtimeMs: number;
}

/** A file's bytes are streamed from disk; everything else is a header. */
export type ZipPart = Buffer | { file: string; size: number };

export interface ZipPlan {
  totalBytes: number;
  parts: ZipPart[];
}

/** The files a package holds: manifest, catalogue, then each asset once. */
export function packageFileNames(manifest: ReleaseManifest): string[] {
  const names = ["manifest.json", manifest.catalogue.filename || "catalogue.sqlite"];
  for (const asset of manifest.assets) {
    if (!names.includes(asset.path)) names.push(asset.path);
  }
  return names;
}

function crc32OfFile(file: string): number {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let crc = 0;
    let read: number;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      crc = zlib.crc32(buffer.subarray(0, read), crc);
    }
    return crc;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Sizes and CRCs for a release's files, cached beside it. An entry is reused
 * only while its file's size and modified time are unchanged, since signing
 * a release rewrites manifest.json after it is built.
 */
export function packageIndex(dir: string, manifest: ReleaseManifest): PackageFile[] {
  const indexPath = path.join(dir, INDEX_FILE);
  let cached = new Map<string, IndexEntry>();
  try {
    const entries = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as IndexEntry[];
    cached = new Map(entries.map((e) => [e.name, e]));
  } catch {
    // No index yet
  }

  let changed = false;
  const entries: IndexEntry[] = [];
  for (const name of packageFileNames(manifest)) {
    const file = path.resolve(dir, name);
    if (!file.startsWith(dir + path.sep)) throw new Error(`Invalid package path: ${name}`);
    const stat = fs.statSync(file);
    const hit = cached.get(name);
    if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) {
      entries.push(hit);
    } else {
      entries.push({ name, size: stat.size, crc32: crc32OfFile(file), mtimeMs: stat.mtimeMs });
      changed = true;
    }
  }

  if (changed || entries.length !== cached.size) {
    const tmp = `${indexPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries));
    fs.renameSync(tmp, indexPath);
  }
  return entries.map(({ name, size, crc32 }) => ({ name, size, crc32 }));
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

/** ZIP64 extended-information extra field holding the given 64-bit values. */
function zip64Extra(values: number[]): Buffer {
  const extra = Buffer.alloc(4 + values.length * 8);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(values.length * 8, 2);
  values.forEach((v, i) => extra.writeBigUInt64LE(BigInt(v), 4 + i * 8));
  return extra;
}

/**
 * Lay out a stored zip of `files` (read from `dir`) as header buffers and
 * file references, with its exact total length. `zip64Threshold` exists so
 * tests can exercise the ZIP64 records without 4 GB of data.
 */
export function planZip(
  dir: string,
  files: PackageFile[],
  modified: Date,
  zip64Threshold = MAX_32
): ZipPlan {
  const { time, date } = dosDateTime(modified);
  const big = (n: number) => n >= zip64Threshold;
  const parts: ZipPart[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf-8");
    const sizeIs64 = big(f.size);
    const offsetIs64 = big(offset);

    const localExtra = sizeIs64 ? zip64Extra([f.size, f.size]) : Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(sizeIs64 ? 45 : 20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(f.crc32 >>> 0, 14);
    local.writeUInt32LE(sizeIs64 ? MAX_32 : f.size, 18);
    local.writeUInt32LE(sizeIs64 ? MAX_32 : f.size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    parts.push(Buffer.concat([local, name, localExtra]), { file: path.join(dir, f.name), size: f.size });

    const centralValues = [...(sizeIs64 ? [f.size, f.size] : []), ...(offsetIs64 ? [offset] : [])];
    const centralExtra = centralValues.length ? zip64Extra(centralValues) : Buffer.alloc(0);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 45, 4); // made by Unix, spec 4.5
    header.writeUInt16LE(sizeIs64 || offsetIs64 ? 45 : 20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(f.crc32 >>> 0, 16);
    header.writeUInt32LE(sizeIs64 ? MAX_32 : f.size, 20);
    header.writeUInt32LE(sizeIs64 ? MAX_32 : f.size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(centralExtra.length, 30);
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    header.writeUInt32LE(offsetIs64 ? MAX_32 : offset, 42);
    central.push(Buffer.concat([header, name, centralExtra]));

    offset += local.length + name.length + localExtra.length + f.size;
  }

  const cdOffset = offset;
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  parts.push(...central);

  const needsZip64 = files.length > MAX_16 || big(cdOffset) || big(cdSize) || big(cdOffset + cdSize);
  if (needsZip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(BigInt(44), 4);
    record.writeUInt16LE((3 << 8) | 45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(files.length), 24);
    record.writeBigUInt64LE(BigInt(files.length), 32);
    record.writeBigUInt64LE(BigInt(cdSize), 40);
    record.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(record, locator);
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(files.length, MAX_16), 8);
  end.writeUInt16LE(Math.min(files.length, MAX_16), 10);
  end.writeUInt32LE(needsZip64 && big(cdSize) ? MAX_32 : cdSize, 12);
  end.writeUInt32LE(needsZip64 ? MAX_32 : cdOffset, 16);
  parts.push(end);

  const totalBytes = parts.reduce((n, p) => n + (Buffer.isBuffer(p) ? p.length : p.size), 0);
  return { totalBytes, parts };
}

/** A filename for the download: skillslab-v1.4.0.skillslab */
export function packageFilename(manifest: ReleaseManifest): string {
  const version = manifest.release_version.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return `skillslab-v${version || manifest.release_id}${PACKAGE_EXTENSION}`;
}
