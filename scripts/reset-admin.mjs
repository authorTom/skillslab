// Gets an administrator back in when nobody can sign in. Run it on the server:
//
//   npm run reset-admin -- <username>                                  (from source)
//   docker compose exec app node scripts/reset-admin.mjs <username>    (container)
//
// If the account exists it becomes an enabled administrator with a new
// temporary password and is signed out everywhere; otherwise it is created.
// The temporary password is printed once and must be replaced at sign-in.
// Only someone with a shell on the server can run this.

import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// The same format and cost as src/lib/passwords.ts.
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const username = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
  console.error("Usage: node scripts/reset-admin.mjs <username>");
  console.error("Usernames are 3–32 characters: letters, numbers, dots, dashes and underscores.");
  process.exit(1);
}

const dbPath = path.join(process.cwd(), "data", "app.db");
if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath}. Run this from the app's directory, after it has started once.`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) {
  console.error("This database has no accounts table yet. Start the new version of the app once, then try again.");
  process.exit(1);
}

const password = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("")
).join("-");
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64, {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELISM,
  maxmem: 64 * 1024 * 1024,
});
const hash = ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64url"), key.toString("base64url")].join("$");

const now = Date.now();
const created = db.transaction(() => {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1, disabled_at = NULL,
         role = 'admin' WHERE id = ?`
    ).run(hash, existing.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  } else {
    db.prepare(
      `INSERT INTO users (username, name, role, password_hash, must_change_password, created_at)
       VALUES (?, ?, 'admin', ?, 1, ?)`
    ).run(username, username, hash, now);
  }
  db.prepare("DELETE FROM login_attempts WHERE key = ?").run(`user:${username}`);
  db.prepare("DELETE FROM app_meta WHERE key = 'setup_code'").run();
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor, action, target, detail, ip)
     VALUES (?, NULL, 'console', 'console.reset_admin', ?, ?, '')`
  ).run(now, username, existing ? "reset" : "created");
  return !existing;
})();
db.close();

console.log(`${created ? "Created" : "Reset"} administrator “${username}”.`);
console.log(`Temporary password: ${password}`);
console.log("Sign in at /admin with it; you'll be asked to choose a new password.");
