import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "./audit";
import { clearFailures, lockedFor, recordFailure, throttleKeys, waitMessage } from "./login-throttle";
import { passwordProblem, verifyDummyPassword, verifyPassword } from "./passwords";
import { createSession, revokeSession, revokeUserSessions, sessionUser } from "./sessions";
import {
  findCredentials,
  normaliseUsername,
  recordLogin,
  setPassword,
  type Result,
  type Role,
  type User,
} from "./users";

/** proxy.ts keeps its own copy of this name: it can't import server modules. */
export const SESSION_COOKIE = "skillslab_session";
/** The single shared-password cookie of earlier versions. */
const LEGACY_COOKIE = "admin_session";

export type CurrentUser = User & { sessionId: number };

/** The caller's address and browser, for the audit log and sign-in limits. */
export async function requestInfo(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  // The last hop is the one the nearest proxy (or Next.js itself) recorded.
  const ip = (h.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() ?? "";
  return { ip: ip.slice(0, 64), userAgent: (h.get("user-agent") ?? "").slice(0, 200) };
}

/** The signed-in account for this request, or null. Read once per render. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const found = sessionUser(token);
  return found && { ...found.user, sessionId: found.session.id };
});

/**
 * The signed-in account, or a redirect to the sign-in page. An account with a
 * temporary password is sent to choose its own before anything else, unless
 * the caller is that page.
 */
export async function requireUser(
  { allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.must_change_password && !allowPasswordChange) redirect("/admin/account/password");
  return user;
}

/** As requireUser, and the account must have this role. */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect("/admin?notice=admins-only");
  return user;
}

async function setSessionCookie(token: string, expiresAt: number): Promise<void> {
  const store = await cookies();
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/admin",
    expires: new Date(expiresAt),
  });
}

async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous) revokeSession(previous);
  if (store.has(LEGACY_COOKIE)) store.delete(LEGACY_COOKIE);
  const { token, expiresAt } = createSession(userId, await requestInfo());
  await setSessionCookie(token, expiresAt);
}

const WRONG_CREDENTIALS = "That username and password don’t match an account.";

export async function signIn(
  rawUsername: string,
  password: string
): Promise<Result<{ mustChangePassword: boolean }>> {
  const { ip } = await requestInfo();
  const username = normaliseUsername(rawUsername).slice(0, 64);
  if (!username || !password) return { ok: false, error: "Enter your username and password." };

  const keys = throttleKeys(username, ip);
  const wait = lockedFor(keys);
  if (wait) {
    recordAudit("anonymous", "auth.login_locked", { target: username, ip });
    return { ok: false, error: waitMessage(wait) };
  }

  const account = findCredentials(username);
  const valid = account
    ? await verifyPassword(password, account.password_hash)
    : (await verifyDummyPassword(password), false);
  if (!account || !valid) {
    recordFailure(keys);
    recordAudit("anonymous", "auth.login_failed", { target: username, ip });
    return { ok: false, error: WRONG_CREDENTIALS };
  }
  if (account.disabled_at) {
    recordAudit("anonymous", "auth.login_failed", { target: username, detail: "disabled", ip });
    return { ok: false, error: "This account is disabled. Ask an administrator to enable it." };
  }

  clearFailures(keys.slice(0, 1));
  await startSession(account.id);
  recordLogin(account.id);
  recordAudit(account, "auth.login", { ip });
  return { ok: true, mustChangePassword: account.must_change_password };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const found = sessionUser(token);
    revokeSession(token);
    if (found) recordAudit(found.user, "auth.logout", { ip: (await requestInfo()).ip });
  }
  store.delete({ name: SESSION_COOKIE, path: "/admin" });
}

/**
 * Changes the signed-in account's own password. Every session ends, this one
 * included, and a fresh one is issued — so a stolen cookie dies with the old
 * password.
 */
export async function changeOwnPassword(
  user: CurrentUser,
  input: { current: string; next: string; confirm: string }
): Promise<Result> {
  const keys = [`password:${user.id}`];
  const wait = lockedFor(keys);
  if (wait) return { ok: false, error: waitMessage(wait) };
  const account = findCredentials(user.username);
  if (!account || !(await verifyPassword(input.current, account.password_hash))) {
    recordFailure(keys);
    return { ok: false, error: "Your current password isn’t right." };
  }
  clearFailures(keys);
  if (input.next !== input.confirm) return { ok: false, error: "The new passwords don’t match." };
  if (input.next === input.current) {
    return { ok: false, error: "Choose a password different from your current one." };
  }
  const problem = passwordProblem(input.next, user.username);
  if (problem) return { ok: false, error: problem };

  const changed = await setPassword(user.id, input.next, { temporary: false });
  if (!changed.ok) return changed;
  await startSession(user.id);
  recordAudit(user, "auth.password_changed", { ip: (await requestInfo()).ip });
  return { ok: true };
}

/** Signs the account out on every other device. */
export async function revokeOtherSessions(user: CurrentUser): Promise<number> {
  const count = revokeUserSessions(user.id, user.sessionId);
  recordAudit(user, "auth.sessions_revoked", { detail: `${count}`, ip: (await requestInfo()).ip });
  return count;
}
