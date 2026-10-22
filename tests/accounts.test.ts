import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// db.ts resolves its data directory from the working directory at import
// time and caches the connection on globalThis, so each test gets a fresh
// directory, fresh modules and no cached connection.
declare global {
  var __clinicalSkillsDb: Database.Database | undefined;
}

let tmp: string;
let cwd: string;

async function load() {
  vi.resetModules();
  globalThis.__clinicalSkillsDb = undefined;
  return {
    db: (await import("@/lib/db")).getDb(),
    users: await import("@/lib/users"),
    sessions: await import("@/lib/sessions"),
    throttle: await import("@/lib/login-throttle"),
    passwords: await import("@/lib/passwords"),
    bootstrap: await import("@/lib/bootstrap"),
    audit: await import("@/lib/audit"),
  };
}

type Modules = Awaited<ReturnType<typeof load>>;

const STRONG = "correct horse battery staple";

async function makeUser(
  m: Modules,
  username: string,
  role: "admin" | "editor" = "admin",
  password = STRONG
) {
  const result = await m.users.createUser({
    username,
    name: username.toUpperCase(),
    role,
    password,
    mustChangePassword: false,
  });
  if (!result.ok) throw new Error(result.error);
  return result.user;
}

beforeEach(() => {
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-accounts-"));
  process.chdir(tmp);
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_USERNAME;
  // Only Date is faked, so scrypt's callbacks still run.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T09:00:00Z") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.__clinicalSkillsDb?.close();
  globalThis.__clinicalSkillsDb = undefined;
  process.chdir(cwd);
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_USERNAME;
});

describe("passwords", () => {
  it("verifies the password it hashed, and nothing else", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/passwords");
    const hash = await hashPassword(STRONG);
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword(STRONG, hash)).toBe(true);
    expect(await verifyPassword(`${STRONG} `, hash)).toBe(false);
    expect(await hashPassword(STRONG)).not.toBe(hash);
  });

  it("rejects malformed hashes instead of throwing", async () => {
    const { verifyPassword } = await import("@/lib/passwords");
    for (const bad of ["", "plain", "scrypt$1$2$3", "scrypt$x$8$1$abc$def", "bcrypt$1$2$3$4$5"]) {
      expect(await verifyPassword(STRONG, bad)).toBe(false);
    }
  });

  it("asks for length and refuses the obvious, not character classes", async () => {
    const { passwordProblem } = await import("@/lib/passwords");
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("Password1234!")).toMatch(/too common/);
    expect(passwordProblem("123456789012")).toMatch(/too common/);
    expect(passwordProblem("aaaaaaaaaaaaaa")).toMatch(/repeated/);
    expect(passwordProblem("tom.wright-secret", "tom.wright")).toMatch(/username/);
    expect(passwordProblem(STRONG)).toBeNull();
    expect(passwordProblem("all lower case words here")).toBeNull();
  });

  it("makes temporary passwords without look-alike characters", async () => {
    const { temporaryPassword } = await import("@/lib/passwords");
    const password = temporaryPassword();
    expect(password).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
    expect(temporaryPassword()).not.toBe(password);
  });
});

describe("accounts", () => {
  it("stores usernames lower-case and refuses duplicates in any case", async () => {
    const m = await load();
    const user = await makeUser(m, "Sam.Jones");
    expect(user.username).toBe("sam.jones");
    const again = await m.users.createUser({
      username: "SAM.JONES",
      name: "Another Sam",
      role: "editor",
      password: STRONG,
      mustChangePassword: true,
    });
    expect(again).toEqual({ ok: false, error: expect.stringMatching(/already taken/) });
    expect(m.users.findCredentials("SAM.jones")?.id).toBe(user.id);
  });

  it("validates usernames, names and passwords", async () => {
    const m = await load();
    const base = { name: "X", role: "editor" as const, password: STRONG, mustChangePassword: false };
    expect((await m.users.createUser({ ...base, username: "ab" })).ok).toBe(false);
    expect((await m.users.createUser({ ...base, username: "has space" })).ok).toBe(false);
    expect((await m.users.createUser({ ...base, username: "okay", name: " " })).ok).toBe(false);
    expect((await m.users.createUser({ ...base, username: "okay", password: "weak" })).ok).toBe(false);
    expect(m.users.countUsers()).toBe(0);
  });

  it("never returns a password hash from the user list", async () => {
    const m = await load();
    await makeUser(m, "alice");
    expect(m.users.listUsers()[0]).not.toHaveProperty("password_hash");
    expect(m.users.getUser(1)).not.toHaveProperty("password_hash");
  });

  it("won't let anyone demote, disable or delete themselves", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    await makeUser(m, "bob");
    expect(m.users.updateUser(alice.id, alice.id, { name: "A", role: "editor" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/own role/),
    });
    expect(m.users.setDisabled(alice.id, alice.id, true).ok).toBe(false);
    expect(m.users.deleteUser(alice.id, alice.id).ok).toBe(false);
    expect(m.users.getUser(alice.id)).toMatchObject({ role: "admin", disabled_at: null });
  });

  it("always keeps one active administrator", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const bob = await makeUser(m, "bob");
    // Bob may demote Alice while Bob is still an admin…
    expect(m.users.updateUser(bob.id, alice.id, { name: "A", role: "editor" }).ok).toBe(true);
    // …but no one can then remove Bob, the last one, however it's attempted.
    const editorActor = alice.id;
    expect(m.users.updateUser(editorActor, bob.id, { name: "B", role: "editor" }).ok).toBe(false);
    expect(m.users.setDisabled(editorActor, bob.id, true).ok).toBe(false);
    expect(m.users.deleteUser(editorActor, bob.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/only active administrator/),
    });
    // A disabled admin doesn't count as one.
    const carol = await makeUser(m, "carol");
    expect(m.users.setDisabled(bob.id, carol.id, true).ok).toBe(true);
    expect(m.users.deleteUser(carol.id, bob.id).ok).toBe(false);
  });

  it("deletes the account's sessions with it but keeps its audit entries", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const bob = await makeUser(m, "bob", "editor");
    const { token } = m.sessions.createSession(bob.id);
    m.audit.recordAudit(bob, "skill.delete", { target: "Venepuncture" });

    expect(m.users.deleteUser(alice.id, bob.id).ok).toBe(true);
    expect(m.sessions.sessionUser(token)).toBeNull();
    expect(m.audit.listAudit()[0]).toMatchObject({ actor: "bob", actor_id: null, action: "skill.delete" });
  });
});

describe("sessions", () => {
  it("finds the account behind a token, and stores only a hash", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const { token, expiresAt } = m.sessions.createSession(alice.id, { ip: "10.0.0.1", userAgent: "Safari" });
    expect(expiresAt).toBe(Date.now() + m.sessions.SESSION_MAX_MS);
    expect(m.sessions.sessionUser(token)?.user).toMatchObject({ id: alice.id, role: "admin" });
    const stored = m.db.prepare("SELECT token_hash FROM sessions").pluck().get() as string;
    expect(stored).not.toContain(token);
    expect(m.sessions.sessionUser("not-a-token")).toBeNull();
  });

  it("ends after the idle limit, and keeps going while used", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const used = m.sessions.createSession(alice.id).token;
    const idle = m.sessions.createSession(alice.id).token;

    vi.advanceTimersByTime(m.sessions.SESSION_IDLE_MS - 60_000);
    expect(m.sessions.sessionUser(used)).not.toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(m.sessions.sessionUser(idle)).toBeNull();
    // The request a minute ago reset the idle clock for this one.
    vi.advanceTimersByTime(m.sessions.SESSION_IDLE_MS / 4);
    expect(m.sessions.sessionUser(used)).not.toBeNull();
  });

  it("ends at the absolute limit however active", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const { token } = m.sessions.createSession(alice.id);
    const step = 30 * 60_000;
    for (let t = step; t < m.sessions.SESSION_MAX_MS; t += step) {
      vi.advanceTimersByTime(step);
      expect(m.sessions.sessionUser(token)).not.toBeNull();
    }
    vi.advanceTimersByTime(step);
    expect(m.sessions.sessionUser(token)).toBeNull();
  });

  it("sees role changes at once and refuses disabled accounts", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const bob = await makeUser(m, "bob");
    const { token } = m.sessions.createSession(bob.id);
    m.users.updateUser(alice.id, bob.id, { name: "Bob", role: "editor" });
    expect(m.sessions.sessionUser(token)?.user.role).toBe("editor");

    const second = m.sessions.createSession(bob.id).token;
    m.users.setDisabled(alice.id, bob.id, true);
    expect(m.sessions.sessionUser(token)).toBeNull();
    expect(m.sessions.sessionUser(second)).toBeNull();
    m.users.setDisabled(alice.id, bob.id, false);
    expect(m.sessions.sessionUser(second)).toBeNull();
  });

  it("signs out everywhere on a password change, except a session asked to be kept", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const phone = m.sessions.createSession(alice.id).token;
    const laptop = m.sessions.createSession(alice.id).token;
    const laptopId = m.sessions.sessionUser(laptop)!.session.id;

    await m.users.setPassword(alice.id, "a brand new passphrase", { temporary: false, keepSessionId: laptopId });
    expect(m.sessions.sessionUser(phone)).toBeNull();
    expect(m.sessions.sessionUser(laptop)).not.toBeNull();

    await m.users.setPassword(alice.id, "temporary-one", { temporary: true });
    expect(m.sessions.sessionUser(laptop)).toBeNull();
    expect(m.users.getUser(alice.id)?.must_change_password).toBe(true);
  });
});

describe("failed sign-in limits", () => {
  it("locks a username after five failures, for fifteen minutes", async () => {
    const m = await load();
    const keys = m.throttle.throttleKeys("alice", "203.0.113.9");
    for (let i = 0; i < 4; i++) m.throttle.recordFailure(keys);
    expect(m.throttle.lockedFor(keys)).toBe(0);
    m.throttle.recordFailure(keys);
    expect(m.throttle.lockedFor(keys)).toBe(15 * 60_000);
    // The same username from anywhere else is locked too.
    expect(m.throttle.lockedFor(m.throttle.throttleKeys("alice", "198.51.100.1"))).toBeGreaterThan(0);
    expect(m.throttle.lockedFor(m.throttle.throttleKeys("bob", "198.51.100.1"))).toBe(0);

    vi.advanceTimersByTime(15 * 60_000);
    expect(m.throttle.lockedFor(keys)).toBe(0);
  });

  it("forgets failures spread out beyond the window", async () => {
    const m = await load();
    const keys = m.throttle.throttleKeys("alice", "");
    for (let i = 0; i < 10; i++) {
      m.throttle.recordFailure(keys);
      vi.advanceTimersByTime(4 * 60_000);
    }
    expect(m.throttle.lockedFor(keys)).toBe(0);
  });

  it("locks an address trying many usernames", async () => {
    const m = await load();
    for (let i = 0; i < 20; i++) m.throttle.recordFailure(m.throttle.throttleKeys(`user${i}`, "203.0.113.9"));
    expect(m.throttle.lockedFor(m.throttle.throttleKeys("fresh", "203.0.113.9"))).toBeGreaterThan(0);
    expect(m.throttle.lockedFor(m.throttle.throttleKeys("fresh", "198.51.100.1"))).toBe(0);
  });
});

describe("the first administrator", () => {
  it("is created from ADMIN_PASSWORD on an install with no accounts, and must change it", async () => {
    process.env.ADMIN_PASSWORD = "the-old-shared-pw";
    const m = await load();
    expect(await m.bootstrap.ensureAdminAccess()).toBe("ready");

    const admin = m.users.findCredentials("admin")!;
    expect(admin).toMatchObject({ role: "admin", must_change_password: true });
    expect(await m.passwords.verifyPassword("the-old-shared-pw", admin.password_hash)).toBe(true);
    expect(m.audit.listAudit()[0].action).toBe("setup.admin_from_env");
  });

  it("uses ADMIN_USERNAME when given", async () => {
    process.env.ADMIN_PASSWORD = "the-old-shared-pw";
    process.env.ADMIN_USERNAME = "Skills.Lead";
    const m = await load();
    await m.bootstrap.ensureAdminAccess();
    expect(m.users.listUsers().map((u) => u.username)).toEqual(["skills.lead"]);
  });

  it("ignores ADMIN_PASSWORD once any account exists, so a restart never resets a password", async () => {
    const m = await load();
    await makeUser(m, "alice");
    process.env.ADMIN_PASSWORD = "the-old-shared-pw";
    await m.bootstrap.startup();
    expect(m.users.listUsers().map((u) => u.username)).toEqual(["alice"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_PASSWORD is ignored/));
  });

  it("refuses a published default and falls back to a setup code", async () => {
    process.env.ADMIN_PASSWORD = "change-me";
    const m = await load();
    expect(await m.bootstrap.ensureAdminAccess()).toBe("setup");
    expect(m.users.countUsers()).toBe(0);
  });

  it("can be created once with the setup code from the log", async () => {
    const m = await load();
    expect(await m.bootstrap.ensureAdminAccess()).toBe("setup");
    const logged = vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).join("\n");
    const code = logged.match(/[a-z2-9]{4}(?:-[a-z2-9]{4}){4}/)![0];

    const input = { username: "alice", name: "Alice", password: STRONG };
    const wrong = await m.bootstrap.completeSetup({ ...input, code: "aaaa-bbbb-cccc-dddd-eeee" }, "");
    expect(wrong).toMatchObject({ ok: false, error: expect.stringMatching(/setup code/) });
    expect(m.users.countUsers()).toBe(0);

    const weak = await m.bootstrap.completeSetup({ ...input, password: "weak", code }, "");
    expect(weak.ok).toBe(false);

    const done = await m.bootstrap.completeSetup({ ...input, code: ` ${code.toUpperCase()} ` }, "");
    expect(done).toMatchObject({ ok: true, user: { username: "alice", role: "admin", must_change_password: false } });
    expect(await m.bootstrap.ensureAdminAccess()).toBe("ready");

    const again = await m.bootstrap.completeSetup({ ...input, username: "mallory", code }, "");
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
    expect(m.db.prepare("SELECT 1 FROM app_meta WHERE key = 'setup_code'").get()).toBeUndefined();
  });

  it("gets a fresh setup code at each server start", async () => {
    const m = await load();
    await m.bootstrap.startup();
    const first = m.db.prepare("SELECT value FROM app_meta WHERE key = 'setup_code'").pluck().get();
    await m.bootstrap.ensureAdminAccess();
    expect(m.db.prepare("SELECT value FROM app_meta WHERE key = 'setup_code'").pluck().get()).toBe(first);
    await m.bootstrap.startup();
    expect(m.db.prepare("SELECT value FROM app_meta WHERE key = 'setup_code'").pluck().get()).not.toBe(first);
  });

  it("locks the setup form after repeated wrong codes", async () => {
    const m = await load();
    await m.bootstrap.ensureAdminAccess();
    const input = { username: "alice", name: "Alice", password: STRONG, code: "wrong" };
    for (let i = 0; i < 5; i++) await m.bootstrap.completeSetup(input, "");
    expect(await m.bootstrap.completeSetup(input, "")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Too many failed attempts/),
    });
  });
});

describe("scripts/reset-admin.mjs", () => {
  const script = path.join(__dirname, "..", "scripts", "reset-admin.mjs");
  const run = (username: string) =>
    execFileSync(process.execPath, [script, username], { cwd: tmp, encoding: "utf8" });
  const passwordFrom = (output: string) => output.match(/Temporary password: (\S+)/)![1];

  it("re-enables, promotes and resets an account, signing it out", async () => {
    const m = await load();
    const alice = await makeUser(m, "alice");
    const bob = await makeUser(m, "bob", "editor");
    m.users.setDisabled(alice.id, bob.id, true);
    const { token } = m.sessions.createSession(bob.id);

    const password = passwordFrom(run("Bob"));
    const after = m.users.findCredentials("bob")!;
    expect(after).toMatchObject({ role: "admin", disabled_at: null, must_change_password: true });
    expect(await m.passwords.verifyPassword(password, after.password_hash)).toBe(true);
    expect(m.sessions.sessionUser(token)).toBeNull();
    expect(m.audit.listAudit()[0]).toMatchObject({ actor: "console", action: "console.reset_admin" });
  });

  it("creates the account if it doesn't exist and clears any setup code", async () => {
    const m = await load();
    await m.bootstrap.ensureAdminAccess();
    const password = passwordFrom(run("rescue"));
    const rescue = m.users.findCredentials("rescue")!;
    expect(rescue.role).toBe("admin");
    expect(await m.passwords.verifyPassword(password, rescue.password_hash)).toBe(true);
    expect(await m.bootstrap.ensureAdminAccess()).toBe("ready");
  });

  it("refuses an invalid username", async () => {
    await load();
    expect(() => execFileSync(process.execPath, [script, "a b"], { cwd: tmp, stdio: "pipe" })).toThrow();
  });
});
