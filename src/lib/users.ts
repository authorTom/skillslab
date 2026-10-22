import { getDb } from "./db";
import { hashPassword, passwordProblem } from "./passwords";
import { revokeUserSessions } from "./sessions";

export type Role = "admin" | "editor";

export const ROLES: Role[] = ["admin", "editor"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  editor: "Editor",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including users, offline releases and emptying the recycle bin.",
  editor: "Courses, categories and the media library. Can restore from the recycle bin.",
};

/** An account as the rest of the app sees it — never with its password hash. */
export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  must_change_password: boolean;
  disabled_at: number | null;
  last_login_at: number | null;
  created_at: number;
};

type UserRow = Omit<User, "must_change_password"> & {
  must_change_password: number;
  password_hash: string;
};

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const COLUMNS =
  "id, username, name, role, must_change_password, disabled_at, last_login_at, created_at";

function toUser(row: Omit<UserRow, "password_hash">): User {
  return { ...row, must_change_password: row.must_change_password === 1 };
}

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameProblem(username: string): string | null {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)
    ? null
    : "Usernames are 3–32 characters: letters, numbers, dots, dashes and underscores.";
}

function nameProblem(name: string): string | null {
  if (!name) return "Enter the person’s name.";
  if (name.length > 100) return "Keep the name under 100 characters.";
  return null;
}

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

export function listUsers(): User[] {
  return (
    getDb().prepare(`SELECT ${COLUMNS} FROM users ORDER BY username`).all() as UserRow[]
  ).map(toUser);
}

export function getUser(id: number): User | undefined {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  return row && toUser(row);
}

/** The account and its password hash, for checking a sign-in. */
export function findCredentials(username: string): (User & { password_hash: string }) | undefined {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS}, password_hash FROM users WHERE username = ?`)
    .get(normaliseUsername(username)) as UserRow | undefined;
  return row && { ...toUser(row), password_hash: row.password_hash };
}

export function countUsers(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function countActiveAdmins(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL")
      .get() as { n: number }
  ).n;
}

export async function createUser(input: {
  username: string;
  name: string;
  role: Role;
  password: string;
  mustChangePassword: boolean;
  /** Skips the strength rules — for passwords the operator already chose, like ADMIN_PASSWORD. */
  trustedPassword?: boolean;
}): Promise<Result<{ user: User }>> {
  const username = normaliseUsername(input.username);
  const name = input.name.trim();
  const problem =
    usernameProblem(username) ??
    nameProblem(name) ??
    (input.trustedPassword ? null : passwordProblem(input.password, username));
  if (problem) return { ok: false, error: problem };
  if (!isRole(input.role)) return { ok: false, error: "Choose a role." };

  const hash = await hashPassword(input.password);
  const db = getDb();
  return db.transaction((): Result<{ user: User }> => {
    if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
      return { ok: false, error: `The username “${username}” is already taken.` };
    }
    const id = Number(
      db
        .prepare(
          `INSERT INTO users (username, name, role, password_hash, must_change_password, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(username, name, input.role, hash, input.mustChangePassword ? 1 : 0, Date.now())
        .lastInsertRowid
    );
    return { ok: true, user: getUser(id)! };
  }).immediate();
}

/**
 * Why `actorId` may not demote, disable or delete `target`, or null if they
 * may. Nobody can do it to themselves, and nobody can remove the last active
 * administrator — between them, these keep someone able to manage accounts.
 */
function protectedAccount(
  actorId: number,
  target: User,
  change: "demote" | "disable" | "delete"
): string | null {
  if (target.id === actorId) {
    return {
      demote: "You can’t change your own role. Ask another administrator.",
      disable: "You can’t disable your own account.",
      delete: "You can’t delete your own account.",
    }[change];
  }
  if (target.role === "admin" && target.disabled_at === null && countActiveAdmins() <= 1) {
    return `${target.name} is the only active administrator. Make someone else an administrator first.`;
  }
  return null;
}

export function updateUser(
  actorId: number,
  id: number,
  input: { name: string; role: string }
): Result<{ user: User; roleChanged: boolean }> {
  const db = getDb();
  return db.transaction((): Result<{ user: User; roleChanged: boolean }> => {
    const target = getUser(id);
    if (!target) return { ok: false, error: "That user no longer exists." };
    const name = input.name.trim();
    const problem = nameProblem(name);
    if (problem) return { ok: false, error: problem };
    if (!isRole(input.role)) return { ok: false, error: "Choose a role." };

    const roleChanged = input.role !== target.role;
    if (roleChanged && target.role === "admin") {
      const reason = protectedAccount(actorId, target, "demote");
      if (reason) return { ok: false, error: reason };
    }
    db.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").run(name, input.role, id);
    return { ok: true, user: getUser(id)!, roleChanged };
  }).immediate();
}

/**
 * Sets a new password and signs the account out everywhere (except
 * `keepSessionId`). A temporary password must be replaced at the next sign-in.
 */
export async function setPassword(
  id: number,
  password: string,
  { temporary, keepSessionId }: { temporary: boolean; keepSessionId?: number }
): Promise<Result> {
  const target = getUser(id);
  if (!target) return { ok: false, error: "That user no longer exists." };
  if (!temporary) {
    const problem = passwordProblem(password, target.username);
    if (problem) return { ok: false, error: problem };
  }
  const hash = await hashPassword(password);
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?").run(
      hash,
      temporary ? 1 : 0,
      id
    );
    revokeUserSessions(id, keepSessionId);
  })();
  return { ok: true };
}

export function setDisabled(actorId: number, id: number, disabled: boolean): Result<{ user: User }> {
  const db = getDb();
  return db.transaction((): Result<{ user: User }> => {
    const target = getUser(id);
    if (!target) return { ok: false, error: "That user no longer exists." };
    if (disabled) {
      const reason = protectedAccount(actorId, target, "disable");
      if (reason) return { ok: false, error: reason };
    }
    db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? Date.now() : null, id);
    if (disabled) revokeUserSessions(id);
    return { ok: true, user: getUser(id)! };
  }).immediate();
}

export function deleteUser(actorId: number, id: number): Result<{ user: User }> {
  const db = getDb();
  return db.transaction((): Result<{ user: User }> => {
    const target = getUser(id);
    if (!target) return { ok: false, error: "That user no longer exists." };
    const reason = protectedAccount(actorId, target, "delete");
    if (reason) return { ok: false, error: reason };
    // Sessions go with the account (ON DELETE CASCADE); audit entries keep its name.
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return { ok: true, user: target };
  }).immediate();
}

export function recordLogin(id: number): void {
  getDb().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), id);
}
