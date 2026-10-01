/**
 * Admin PIN lock. When a PIN is set, Settings and Content updates ask for it,
 * so students on a shared iPad can use every skill but can't change the
 * server, roll back content or clear the signing key.
 *
 * Only a salted SHA-256 of the PIN is stored. A four-digit PIN is not secret
 * from someone with the device's storage; the lockout after repeated wrong
 * guesses is what keeps it from being guessed at the keypad.
 */

export const PIN_LENGTH = 4;

const PIN_STORAGE = "skillslab_admin_pin";
const ATTEMPTS_STORAGE = "skillslab_admin_attempts";

/** Wrong guesses allowed before the keypad locks. */
const FREE_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

interface Attempts {
  failures: number;
  lockedUntil: number;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable
  }
}

function readAttempts(): Attempts {
  try {
    const parsed = JSON.parse(read(ATTEMPTS_STORAGE)) as Partial<Attempts>;
    return { failures: Number(parsed.failures) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

async function hash(salt: string, pin: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This device can’t store a PIN securely.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function isPinSet(): boolean {
  return read(PIN_STORAGE).includes(":");
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits.`);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  write(PIN_STORAGE, `${salt}:${await hash(salt, pin)}`);
  write(ATTEMPTS_STORAGE, null);
}

export function clearPin(): void {
  write(PIN_STORAGE, null);
  write(ATTEMPTS_STORAGE, null);
}

/** Milliseconds until the keypad accepts another guess (0 when open). */
export function lockoutRemaining(now = Date.now()): number {
  return Math.max(0, readAttempts().lockedUntil - now);
}

export type PinCheck = { ok: true } | { ok: false; lockedFor: number };

/**
 * Check a PIN. Each wrong guess after the first few locks the keypad for
 * twice as long as the last, and the count survives relaunching the app.
 */
export async function checkPin(pin: string, now = Date.now()): Promise<PinCheck> {
  const waiting = lockoutRemaining(now);
  if (waiting > 0) return { ok: false, lockedFor: waiting };

  const [salt, expected] = read(PIN_STORAGE).split(":");
  if (!salt || !expected) return { ok: true };

  if ((await hash(salt, pin)) === expected) {
    write(ATTEMPTS_STORAGE, null);
    return { ok: true };
  }

  const failures = readAttempts().failures + 1;
  const lockedFor =
    failures < FREE_ATTEMPTS ? 0 : Math.min(MAX_LOCKOUT_MS, FIRST_LOCKOUT_MS * 2 ** (failures - FREE_ATTEMPTS));
  write(ATTEMPTS_STORAGE, JSON.stringify({ failures, lockedUntil: now + lockedFor }));
  return { ok: false, lockedFor };
}
