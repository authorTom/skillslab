import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "admin_session";

const BLOCKED_PASSWORDS = new Set([
  "clinical-admin",
  "change-me",
  "password",
  "admin",
]);

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    throw new Error(
      "ADMIN_PASSWORD is not set. Set the ADMIN_PASSWORD environment variable before starting the server."
    );
  }
  if (BLOCKED_PASSWORDS.has(pw)) {
    throw new Error(
      "ADMIN_PASSWORD is set to a blocked default. Choose a strong, unique password."
    );
  }
  return pw;
}

function sessionToken(): string {
  return crypto
    .createHmac("sha256", adminPassword())
    .update("clinical-skills-admin-session")
    .digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  const expected = sessionToken();
  return (
    value.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function startSession(password: string): Promise<boolean> {
  const expected = adminPassword();
  const given = password ?? "";
  const ok =
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return false;
  const store = await cookies();
  store.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
