import fs from "fs";
import path from "path";
import { fileResponse, securityHeaders } from "@/lib/file-response";
import { getRelease } from "@/lib/offline/releases";

const NOSNIFF = { "X-Content-Type-Options": "nosniff" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const release = getRelease(id);
  if (!release) {
    return Response.json({ error: "Release not found" }, { status: 404, headers: NOSNIFF });
  }

  const url = new URL(request.url);
  const file = url.searchParams.get("file");

  if (!file) {
    return Response.json(release.manifest, {
      headers: { ...NOSNIFF, "Cache-Control": "public, max-age=3600, immutable" },
    });
  }

  const resolved = path.resolve(release.dir, file);
  if (!resolved.startsWith(release.dir + path.sep)) {
    return Response.json({ error: "Invalid path" }, { status: 400, headers: NOSNIFF });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return Response.json({ error: "File not found" }, { status: 404, headers: NOSNIFF });
  }
  if (!stat.isFile()) {
    return Response.json({ error: "File not found" }, { status: 404, headers: NOSNIFF });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType =
    ext === ".json" ? "application/json" :
    ext === ".sqlite" ? "application/x-sqlite3" :
    "application/octet-stream";

  // Streamed from disk: release assets include videos that can run to
  // hundreds of megabytes, too large to buffer per request.
  return fileResponse(resolved, stat.size, request.headers.get("range"), {
    ...securityHeaders(contentType),
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}
