import fs from "fs";
import path from "path";
import { getDb, UPLOADS_DIR } from "@/lib/db";
import { fileResponse, securityHeaders } from "@/lib/file-response";
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
  if (!stat.isFile()) return notFound();

  const filename = asciiName(media?.filename ?? storageName);
  return fileResponse(resolved, stat.size, request.headers.get("range"), {
    ...securityHeaders(contentType),
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "public, max-age=3600",
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "X-Content-Type-Options": "nosniff" },
  });
}

/** Header-safe filename: quotes and non-ASCII would break the header. */
function asciiName(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
}
