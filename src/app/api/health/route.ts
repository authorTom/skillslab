import { getDb } from "@/lib/db";

/**
 * Liveness check for the container healthcheck and any monitoring: 200 when
 * the database answers a trivial query, 503 when it doesn't. It says nothing
 * else, so it is safe to leave reachable.
 */
export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return respond(200, "ok");
  } catch {
    return respond(503, "unavailable");
  }
}

function respond(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
