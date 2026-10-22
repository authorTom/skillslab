import { getDb } from "./db";

/** Who did something: a signed-in user, or a name for the server itself. */
export type Actor = { id: number; username: string } | "system" | "console" | "anonymous";

export type AuditEntry = {
  id: number;
  at: number;
  actor_id: number | null;
  actor: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
};

/** How long entries are kept. */
export const AUDIT_RETENTION_DAYS = 365;

/** Human wording for each action, shown on the audit page. */
export const AUDIT_ACTIONS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.login_locked": "Sign-in blocked (too many attempts)",
  "auth.logout": "Signed out",
  "auth.password_changed": "Changed own password",
  "auth.sessions_revoked": "Signed out other devices",
  "setup.admin_created": "Created the first administrator",
  "setup.code_failed": "Wrong setup code",
  "setup.admin_from_env": "Created administrator from ADMIN_PASSWORD",
  "console.reset_admin": "Reset an administrator from the server console",
  "user.create": "Created user",
  "user.update": "Updated user",
  "user.role_change": "Changed role",
  "user.password_reset": "Reset password",
  "user.disable": "Disabled user",
  "user.enable": "Enabled user",
  "user.sessions_revoked": "Signed user out everywhere",
  "user.delete": "Deleted user",
  "skill.delete": "Deleted course",
  "media.delete": "Deleted library file",
  "trash.purge": "Permanently deleted from bin",
  "trash.empty": "Emptied recycle bin",
  "release.build": "Built offline release",
  "release.mark_current": "Made release current",
  "release.delete": "Deleted release",
};

export function recordAudit(
  actor: Actor,
  action: string,
  { target = "", detail = "", ip = "" }: { target?: string; detail?: string; ip?: string } = {}
): void {
  const named = typeof actor === "string" ? { id: null, username: actor } : actor;
  getDb()
    .prepare(
      `INSERT INTO audit_log (at, actor_id, actor, action, target, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(Date.now(), named.id, named.username, action, target.slice(0, 200), detail.slice(0, 500), ip);
}

export function listAudit({
  limit = 100,
  offset = 0,
  target,
}: { limit?: number; offset?: number; target?: string } = {}): AuditEntry[] {
  const where = target === undefined ? "" : "WHERE target = @target OR actor = @target";
  return getDb()
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ limit, offset, target }) as AuditEntry[];
}

export function countAudit(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n;
}

/** Drops entries past the retention period. Run at startup. */
export function pruneAudit(): number {
  const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 86_400_000;
  return getDb().prepare("DELETE FROM audit_log WHERE at < ?").run(cutoff).changes;
}
