import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getRelease } from "@/lib/offline/releases";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const release = getRelease(id);
  if (!release) {
    return Response.json({ error: "Release not found" }, { status: 404 });
  }

  const url = new URL(_request.url);
  const file = url.searchParams.get("file");

  if (!file) {
    return Response.json(release.manifest, {
      headers: { "Cache-Control": "public, max-age=3600, immutable" },
    });
  }

  const resolved = path.resolve(release.dir, file);
  if (!resolved.startsWith(release.dir + path.sep)) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType =
    ext === ".json" ? "application/json" :
    ext === ".sqlite" ? "application/x-sqlite3" :
    "application/octet-stream";

  // Stream from disk: release assets include videos that can run to hundreds
  // of megabytes, too large to buffer per request.
  const body = Readable.toWeb(fs.createReadStream(resolved)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
