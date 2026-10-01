import fs from "fs";
import { Readable } from "stream";
import { getRelease } from "@/lib/offline/releases";
import { packageFilename, packageIndex, planZip, type ZipPart } from "@/lib/offline/package";

/** Headers, then each file streamed from disk, failing if a file changed
 *  size since the plan (the download would otherwise be silently corrupt). */
async function* zipStream(parts: ZipPart[]): AsyncGenerator<Buffer> {
  for (const part of parts) {
    if (Buffer.isBuffer(part)) {
      yield part;
      continue;
    }
    let sent = 0;
    for await (const chunk of fs.createReadStream(part.file)) {
      sent += (chunk as Buffer).length;
      yield chunk as Buffer;
    }
    if (sent !== part.size) throw new Error(`${part.file} changed during download`);
  }
}

/** The whole release as one .skillslab file, for offline installs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = getRelease(id);
  if (!release) {
    return Response.json({ error: "Release not found" }, { status: 404 });
  }

  let plan;
  try {
    const files = packageIndex(release.dir, release.manifest);
    plan = planZip(release.dir, files, new Date(release.manifest.created_at || Date.now()));
  } catch {
    return Response.json({ error: "Release files are incomplete" }, { status: 500 });
  }

  const body = Readable.toWeb(Readable.from(zipStream(plan.parts))) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      // Not application/zip: Safari would unpack it after downloading.
      "Content-Type": "application/octet-stream",
      "Content-Length": String(plan.totalBytes),
      "Content-Disposition": `attachment; filename="${packageFilename(release.manifest)}"`,
      "Cache-Control": "no-store",
    },
  });
}
