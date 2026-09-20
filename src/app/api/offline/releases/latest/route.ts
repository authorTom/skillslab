import { getCurrentRelease } from "@/lib/offline/releases";

export async function GET(request: Request) {
  const release = getCurrentRelease();
  if (!release) {
    return Response.json({ error: "No current release" }, { status: 404 });
  }

  const etag = `"${release.manifest.release_id}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304 });
  }

  return Response.json(release.manifest, {
    headers: {
      ETag: etag,
      "Cache-Control": "no-cache",
    },
  });
}
