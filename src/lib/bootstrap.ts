import crypto from "crypto";
import { pruneAudit, recordAudit } from "./audit";
import { getDb } from "./db";
import { clearFailures, lockedFor, recordFailure, waitMessage } from "./login-throttle";
import { randomCode } from "./passwords";
import { purgeExpiredSessions } from "./sessions";
import { countActiveAdmins, countUsers, createUser, type Result, type User } from "./users";

/*
 * Getting the first administrator in. Either:
 *
 *   - ADMIN_PASSWORD is set and there are no accounts at all — an upgrade
 *     from the single shared password, or a deployment that chose its own.
 *     An "admin" account (or ADMIN_USERNAME) is created with it, and must
 *     choose a new password at its first sign-in. From then on ADMIN_PASSWORD
 *     is ignored.
 *   - otherwise, while no active administrator exists, a one-time setup code
 *     is printed to the server log. Whoever can read the log can open
 *     /admin/setup and create the first administrator with it.
 */

const SETUP_CODE = "setup_code";
const SETUP_THROTTLE = ["setup:"];

/** The shared passwords earlier versions refused to start with. */
const BLOCKED_ADMIN_PASSWORDS = new Set(["clinical-admin", "change-me", "password", "admin"]);

export type AccessState = "ready" | "setup";

function envAdminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) return null;
  if (BLOCKED_ADMIN_PASSWORDS.has(password)) {
    console.warn(
      "ADMIN_PASSWORD is set to a published default, so no account was created from it. " +
        "Use the setup code below instead, or set a strong ADMIN_PASSWORD and restart."
    );
    return null;
  }
  return password;
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

function storedCodeHash(): string | undefined {
  return (
    getDb().prepare("SELECT value FROM app_meta WHERE key = ?").get(SETUP_CODE) as
      | { value: string }
      | undefined
  )?.value;
}

function clearSetupCode(): void {
  getDb().prepare("DELETE FROM app_meta WHERE key = ?").run(SETUP_CODE);
}

/** Makes a new setup code, replacing any earlier one, and prints it to the log. */
export function issueSetupCode(): string {
  const code = randomCode(5);
  getDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .run(SETUP_CODE, hashCode(code));
  console.warn(
    [
      "",
      "  ┌──────────────────────────────────────────────────────────────┐",
      "  │ SkillsLab has no administrator yet.                          │",
      "  │ Open /admin/setup in a browser and enter this one-time code: │",
      "  │                                                              │",
      `  │     ${code.padEnd(57)}│`,
      "  │                                                              │",
      "  │ It works once, and a restart replaces it with a new one.     │",
      "  └──────────────────────────────────────────────────────────────┘",
      "",
    ].join("\n")
  );
  return code;
}

/**
 * Makes sure someone can sign in, creating the first administrator from
 * ADMIN_PASSWORD or issuing a setup code if needed. Safe to call on every
 * request: once an administrator exists it only checks a count. `rotate`
 * replaces an existing setup code, as happens at each server start.
 */
export async function ensureAdminAccess({ rotate = false } = {}): Promise<AccessState> {
  if (countActiveAdmins() > 0) {
    if (storedCodeHash()) clearSetupCode();
    return "ready";
  }

  const password = countUsers() === 0 ? envAdminPassword() : null;
  if (password) {
    const username = (process.env.ADMIN_USERNAME ?? "").trim() || "admin";
    const created = await createUser({
      username,
      name: "Administrator",
      role: "admin",
      password,
      mustChangePassword: true,
      trustedPassword: true,
    });
    if (created.ok) {
      recordAudit("system", "setup.admin_from_env", { target: created.user.username });
      console.info(
        `Created the administrator “${created.user.username}” from ADMIN_PASSWORD. ` +
          "Sign in with it at /admin; you'll be asked to choose a new password."
      );
      return "ready";
    }
    // A request racing the startup check made it first — or ADMIN_USERNAME is invalid.
    if (countActiveAdmins() > 0) return "ready";
    console.warn(`Couldn't create an administrator from ADMIN_PASSWORD: ${created.error}`);
  }

  if (rotate || !storedCodeHash()) issueSetupCode();
  return "setup";
}

/** Server start: housekeeping, then make sure an administrator can get in. */
export async function startup(): Promise<void> {
  purgeExpiredSessions();
  pruneAudit();
  if (countUsers() > 0 && process.env.ADMIN_PASSWORD) {
    console.warn(
      "ADMIN_PASSWORD is ignored now that admin accounts exist. Remove it from your environment."
    );
  }
  await ensureAdminAccess({ rotate: true });
}

/** Creates the first administrator with the setup code from the log. */
export async function completeSetup(
  input: { code: string; username: string; name: string; password: string },
  ip: string
): Promise<Result<{ user: User }>> {
  const wait = lockedFor(SETUP_THROTTLE);
  if (wait) return { ok: false, error: waitMessage(wait) };
  if ((await ensureAdminAccess()) === "ready") {
    return { ok: false, error: "An administrator already exists. Sign in instead." };
  }

  const stored = storedCodeHash();
  const given = Buffer.from(hashCode(input.code));
  if (!stored || !crypto.timingSafeEqual(given, Buffer.from(stored))) {
    recordFailure(SETUP_THROTTLE);
    recordAudit("anonymous", "setup.code_failed", { ip });
    return {
      ok: false,
      error: "That setup code isn’t right. Copy it from the server log — it changes at each restart.",
    };
  }

  const created = await createUser({
    username: input.username,
    name: input.name,
    role: "admin",
    password: input.password,
    mustChangePassword: false,
  });
  if (!created.ok) return created;

  clearSetupCode();
  clearFailures(SETUP_THROTTLE);
  recordAudit(created.user, "setup.admin_created", { target: created.user.username, ip });
  return created;
}
