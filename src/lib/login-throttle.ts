import { getDb } from "./db";

/*
 * Limits on failed sign-ins. Counted per username, which can't be dodged, and
 * per address, which can: Next.js keeps whatever X-Forwarded-For a client
 * sends when no proxy sets it. The address limit is a backstop against one
 * client trying many usernames, not the main defence.
 */

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

/** Failures allowed within the window, by key prefix. */
const LIMITS: Record<string, number> = { user: 5, ip: 20, setup: 5 };

export function throttleKeys(username: string, ip: string): string[] {
  return [`user:${username}`, ...(ip ? [`ip:${ip}`] : [])];
}

/** Milliseconds until any of these keys may try again; 0 if none is locked. */
export function lockedFor(keys: string[]): number {
  const now = Date.now();
  const select = getDb().prepare("SELECT locked_until FROM login_attempts WHERE key = ?");
  let wait = 0;
  for (const key of keys) {
    const row = select.get(key) as { locked_until: number | null } | undefined;
    if (row?.locked_until && row.locked_until > now) wait = Math.max(wait, row.locked_until - now);
  }
  return wait;
}

export function recordFailure(keys: string[]): void {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (const key of keys) {
      const row = db
        .prepare("SELECT failures, window_started_at FROM login_attempts WHERE key = ?")
        .get(key) as { failures: number; window_started_at: number } | undefined;
      const fresh = !row || row.window_started_at + WINDOW_MS <= now;
      const failures = fresh ? 1 : row.failures + 1;
      const limit = LIMITS[key.split(":")[0]] ?? LIMITS.user;
      db.prepare(
        `INSERT INTO login_attempts (key, failures, window_started_at, locked_until)
         VALUES (@key, @failures, @started, @locked)
         ON CONFLICT (key) DO UPDATE SET failures = @failures,
           window_started_at = @started, locked_until = @locked`
      ).run({
        key,
        failures,
        started: fresh ? now : row.window_started_at,
        locked: failures >= limit ? now + LOCK_MS : null,
      });
    }
  })();
}

export function clearFailures(keys: string[]): void {
  const remove = getDb().prepare("DELETE FROM login_attempts WHERE key = ?");
  for (const key of keys) remove.run(key);
}

export function purgeStaleAttempts(): void {
  const now = Date.now();
  getDb()
    .prepare(
      `DELETE FROM login_attempts WHERE window_started_at + ? <= ?
         AND (locked_until IS NULL OR locked_until <= ?)`
    )
    .run(WINDOW_MS, now, now);
}

export function waitMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
