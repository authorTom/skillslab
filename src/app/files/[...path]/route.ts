import fs from "fs";
import path from "path";
import { getDb, UPLOADS_DIR } from "@/lib/db";
import { MIME_TYPES } from "@/lib/media-types";

/**
 * Serves library files.
 *
 * The canonical form is `/files/<id>/<filename>`: the id resolves the file and
 * the filename is only there to give downloads a sensible name, so renaming a
 * file never breaks a link. A single segment is the pre-library form and still
 * resolves, by storage name, for anything already bookmarked.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const [first, ...rest] = segments.map(decodeURIComponent);

  const id = Number(first);
  const media =
    Number.isInteger(id) && id > 0 && rest.length > 0
      ? (getDb().prepare("SELECT storage_name, filename, mime FROM media WHERE id = ?").get(id) as
          | { storage_name: string; filename: string; mime: string }
          | undefined)
      : (getDb()
          .prepare("SELECT storage_name, filename, mime FROM media WHERE storage_name = ?")
          .get(first) as { storage_name: string; filename: string; mime: string } | undefined);

  const storageName = media?.storage_name ?? (segments.length === 1 ? first : null);
  if (!storageName) return notFound();

  const resolved = path.resolve(UPLOADS_DIR, storageName);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return notFound();

  const contentType = media?.mime ?? MIME_TYPES[path.extname(resolved).toLowerCase()];
  if (!contentType) return notFound();

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return notFound();
  }

  const filename = asciiName(media?.filename ?? storageName);
  const rangeHeader = request.headers.get("range");

  if (rangeHeader && contentType.startsWith("video/")) {
    return rangeResponse(resolved, stat.size, rangeHeader, contentType, filename);
  }

  const data = fs.readFileSync(resolved);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}

function rangeResponse(
  filePath: string,
  fileSize: number,
  rangeHeader: string,
  contentType: string,
  filename: string
): Response {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : Math.min(start + 2 * 1024 * 1024, fileSize - 1);

  if (start >= fileSize || end >= fileSize || start > end) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const length = end - start + 1;
  const handle = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, start);

    return new Response(new Uint8Array(buffer), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } finally {
    fs.closeSync(handle);
  }
}

function notFound() {
  return new Response("Not found", { status: 404 });
}

/** Header-safe filename: quotes and non-ASCII would break the header. */
function asciiName(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
}
