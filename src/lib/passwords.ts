import crypto from "crypto";

/*
 * Password hashing with Node's built-in scrypt. Stored hashes carry their own
 * cost parameters — scrypt$N$r$p$salt$key — so they can be raised later
 * without invalidating existing passwords. scripts/reset-admin.mjs writes the
 * same format.
 */

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
// scrypt needs 128 * N * r bytes; 32 MB at these settings, over Node's default cap.
const MAX_MEMORY = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM, KEY_LENGTH);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const expected = Buffer.from(parts[5], "base64url");
  if (expected.length === 0) return false;
  try {
    const key = await derive(password, Buffer.from(parts[4], "base64url"), n, r, p, expected.length);
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Takes as long as checking a real password, so a sign-in for a username that
 * doesn't exist can't be told apart by how quickly it fails.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}

/** Passwords that appear at the top of every breach list, plus this app's old defaults. */
const COMMON_PASSWORDS = new Set([
  "password",
  "passw0rd",
  "p@ssw0rd",
  "letmein",
  "welcome",
  "qwerty",
  "qwertyuiop",
  "admin",
  "administrator",
  "changeme",
  "change-me",
  "clinical-admin",
  "clinicalskills",
  "skillslab",
  "iloveyou",
  "trustno1",
  "football",
  "monkey",
  "dragon",
  "sunshine",
]);

/**
 * Why a new password isn't acceptable, or null if it is. Length and a
 * blocklist rather than character-class rules, as current NIST guidance
 * recommends: long passphrases beat short "complex" passwords.
 */
export function passwordProblem(password: string, username = ""): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — a few unrelated words work well.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  if (username.length >= 3 && lower.includes(username.toLowerCase())) {
    return "Don’t include your username in your password.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Don’t use one character repeated.";
  }
  const core = lower.replace(/[\d\W_]+$/, "").replace(/^[\d\W_]+/, "");
  const counting = "0123456789".repeat(Math.ceil(MAX_PASSWORD_LENGTH / 10) + 1);
  if (COMMON_PASSWORDS.has(core) || counting.includes(password)) {
    return "That password is too common. Choose something less predictable.";
  }
  return null;
}

/** No 0/o, 1/l/i: temporary passwords and setup codes get read aloud and retyped. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A random code like "k7m2-qx9p-…", about 20 bits per group. */
export function randomCode(groups = 4): string {
  return Array.from({ length: groups }, () =>
    Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("")
  ).join("-");
}

/** A password an administrator hands to someone, who must replace it when they sign in. */
export function temporaryPassword(): string {
  return randomCode(4);
}
