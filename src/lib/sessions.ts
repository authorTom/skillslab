import crypto from "crypto";
import { getDb } from "./db";
import type { User } from "./users";

/*
 * Server-side sessions. The cookie holds a random token; the database holds
 * only its SHA-256, so a session can be ended from the server at any time and
 * a copy of the database can't be replayed as a cookie.
 */

function hours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 3_600_000;
}

/** Signed out after this long without a request. */
export const SESSION_IDLE_MS = hours("SESSION_IDLE_HOURS", 8);
/** Signed out this long after signing in, however active. */
export const SESSION_MAX_MS = hours("SESSION_MAX_HOURS", 12);
/** last_seen_at is only rewritten when it is at least this stale. */
const TOUCH_INTERVAL_MS = 60_000;

export type Session = {
  id: number;
  user_id: number;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  ip: string;
  user_agent: string;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSession(
  userId: number,
  { ip = "", userAgent = "" }: { ip?: string; userAgent?: string } = {}
): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_MS;
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(hashToken(token), userId, now, now, expiresAt, ip, userAgent.slice(0, 200));
  return { token, expiresAt };
}

/**
 * The live session and account behind a cookie's token, or null if it has
 * expired, been revoked, or belongs to a disabled account. The account is read
 * fresh on every request, so a role change or a disable takes effect at once.
 */
export function sessionUser(token: string): { session: Session; user: User } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.created_at AS session_created_at, s.last_seen_at,
              s.expires_at, s.ip, s.user_agent,
              u.id, u.username, u.name, u.role, u.must_change_password, u.disabled_at,
              u.last_login_at, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) as
    | (Omit<User, "must_change_password"> & {
        must_change_password: number;
        session_id: number;
        session_created_at: number;
        last_seen_at: number;
        expires_at: number;
        ip: string;
        user_agent: string;
      })
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now || row.last_seen_at + SESSION_IDLE_MS <= now || row.disabled_at) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
    return null;
  }
  if (now - row.last_seen_at >= TOUCH_INTERVAL_MS) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, row.session_id);
    row.last_seen_at = now;
  }

  return {
    session: {
      id: row.session_id,
      user_id: row.id,
      created_at: row.session_created_at,
      last_seen_at: row.last_seen_at,
      expires_at: row.expires_at,
      ip: row.ip,
      user_agent: row.user_agent,
    },
    user: {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      must_change_password: row.must_change_password === 1,
      disabled_at: row.disabled_at,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
    },
  };
}

export function revokeSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

/** Ends every session for an account, optionally keeping one (the caller's own). */
export function revokeUserSessions(userId: number, exceptSessionId?: number): number {
  return getDb()
    .prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?")
    .run(userId, exceptSessionId ?? -1).changes;
}

/** An account's sessions that are still live, newest activity first. */
export function listUserSessions(userId: number): Session[] {
  const now = Date.now();
  return getDb()
    .prepare(
      `SELECT id, user_id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions
       WHERE user_id = ? AND expires_at > ? AND last_seen_at > ?
       ORDER BY last_seen_at DESC`
    )
    .all(userId, now, now - SESSION_IDLE_MS) as Session[];
}

export function purgeExpiredSessions(): number {
  const now = Date.now();
  return getDb()
    .prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?")
    .run(now, now - SESSION_IDLE_MS).changes;
}
