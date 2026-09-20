import { listReleases } from "@/lib/offline/releases";

export async function GET() {
  return Response.json(listReleases());
}
