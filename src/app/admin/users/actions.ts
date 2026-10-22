"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { requestInfo, requireRole } from "@/lib/auth";
import { temporaryPassword } from "@/lib/passwords";
import { revokeUserSessions } from "@/lib/sessions";
import {
  createUser,
  deleteUser,
  getUser,
  isRole,
  ROLE_LABELS,
  setDisabled,
  setPassword,
  updateUser,
} from "@/lib/users";

/** A temporary password is shown once, in the form's state, and never stored in the clear. */
export type UserActionState = {
  error?: string;
  temporaryPassword?: string;
  username?: string;
  userId?: number;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function backToUser(id: number, message: { success: string } | { error: string }): never {
  const [key, value] = Object.entries(message)[0];
  redirect(`/admin/users/${id}?${key}=${encodeURIComponent(value)}`);
}

export async function createUserAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const admin = await requireRole("admin");
  const role = text(formData, "role");
  if (!isRole(role)) return { error: "Choose a role." };

  const password = temporaryPassword();
  const result = await createUser({
    username: text(formData, "username"),
    name: text(formData, "name"),
    role,
    password,
    mustChangePassword: true,
  });
  if (!result.ok) return { error: result.error };

  recordAudit(admin, "user.create", {
    target: result.user.username,
    detail: ROLE_LABELS[role],
    ip: (await requestInfo()).ip,
  });
  return { temporaryPassword: password, username: result.user.username, userId: result.user.id };
}

export async function updateUserAction(id: number, formData: FormData) {
  const admin = await requireRole("admin");
  const before = getUser(id);
  const result = updateUser(admin.id, id, { name: text(formData, "name"), role: text(formData, "role") });
  if (!result.ok) backToUser(id, { error: result.error });

  const { ip } = await requestInfo();
  if (result.roleChanged) {
    recordAudit(admin, "user.role_change", {
      target: result.user.username,
      detail: `${before ? ROLE_LABELS[before.role] : "?"} → ${ROLE_LABELS[result.user.role]}`,
      ip,
    });
  }
  if (before && before.name !== result.user.name) {
    recordAudit(admin, "user.update", { target: result.user.username, detail: "name", ip });
  }
  backToUser(id, { success: "Changes saved." });
}

/** Bound to an id; used with useActionState, which passes (and this ignores) the form state. */
export async function resetPasswordAction(id: number): Promise<UserActionState> {
  const admin = await requireRole("admin");
  if (id === admin.id) return { error: "Change your own password from your account page." };
  const target = getUser(id);
  if (!target) return { error: "That user no longer exists." };

  const password = temporaryPassword();
  const result = await setPassword(id, password, { temporary: true });
  if (!result.ok) return { error: result.error };

  recordAudit(admin, "user.password_reset", {
    target: target.username,
    ip: (await requestInfo()).ip,
  });
  return { temporaryPassword: password, username: target.username, userId: id };
}

export async function setDisabledAction(id: number, disabled: boolean) {
  const admin = await requireRole("admin");
  const result = setDisabled(admin.id, id, disabled);
  if (!result.ok) backToUser(id, { error: result.error });

  recordAudit(admin, disabled ? "user.disable" : "user.enable", {
    target: result.user.username,
    ip: (await requestInfo()).ip,
  });
  backToUser(id, {
    success: disabled
      ? `${result.user.name} is disabled and has been signed out.`
      : `${result.user.name} can sign in again.`,
  });
}

export async function revokeUserSessionsAction(id: number) {
  const admin = await requireRole("admin");
  const target = getUser(id);
  if (!target) backToUser(id, { error: "That user no longer exists." });

  // Keep the admin's own session if they sign themselves out everywhere else.
  const count = revokeUserSessions(id, id === admin.id ? admin.sessionId : undefined);
  recordAudit(admin, "user.sessions_revoked", {
    target: target.username,
    detail: `${count}`,
    ip: (await requestInfo()).ip,
  });
  backToUser(id, {
    success:
      count === 0
        ? `${target.name} wasn’t signed in anywhere.`
        : `${target.name} was signed out of ${count} ${count === 1 ? "session" : "sessions"}.`,
  });
}

export async function deleteUserAction(id: number) {
  const admin = await requireRole("admin");
  const result = deleteUser(admin.id, id);
  if (!result.ok) backToUser(id, { error: result.error });

  recordAudit(admin, "user.delete", {
    target: result.user.username,
    detail: ROLE_LABELS[result.user.role],
    ip: (await requestInfo()).ip,
  });
  redirect(`/admin/users?success=${encodeURIComponent(`${result.user.name}’s account was deleted.`)}`);
}
