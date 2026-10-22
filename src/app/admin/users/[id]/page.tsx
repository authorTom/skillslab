import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { describeBrowser, timeAgo, utcStamp } from "@/lib/account-display";
import { AUDIT_ACTIONS, listAudit } from "@/lib/audit";
import { listUserSessions } from "@/lib/sessions";
import { getUser, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/users";
import { ResetPasswordForm } from "@/components/admin/AccountForms";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { inputClass, primaryButtonClass } from "@/components/admin/formStyles";
import {
  deleteUserAction,
  resetPasswordAction,
  revokeUserSessionsAction,
  setDisabledAction,
  updateUserAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User",
};

const secondaryButtonClass =
  "rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300";
const dangerButtonClass =
  "rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50";

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
      <div className="max-w-md">
        <h3 className="text-sm font-medium text-stone-800">{title}</h3>
        <p className="mt-0.5 text-sm text-stone-500">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const me = await requireRole("admin");
  const id = Number((await params).id);
  const user = Number.isInteger(id) ? getUser(id) : undefined;
  if (!user) notFound();
  const { success, error } = await searchParams;
  const isMe = user.id === me.id;
  const sessions = listUserSessions(user.id);
  const activity = listAudit({ target: user.username, limit: 20 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/admin/users" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← Users
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {user.username} · {ROLE_LABELS[user.role]}
          {user.disabled_at && " · Disabled"}
          {user.must_change_password && " · Must choose a new password at next sign-in"} · Last
          signed in {timeAgo(user.last_login_at)}
        </p>
      </div>

      {success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Details</h2>
        <form action={updateUserAction.bind(null, user.id)} className="mt-4 space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-stone-700">
              Name
            </label>
            <input id="name" name="name" defaultValue={user.name} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-stone-700">
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue={user.role}
              disabled={isMe}
              className={inputClass}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {/* A disabled select isn't submitted, so send the current role alongside it. */}
            {isMe && <input type="hidden" name="role" value={user.role} />}
            <ul className="mt-1.5 space-y-0.5 text-xs text-stone-400">
              {ROLES.map((role) => (
                <li key={role}>
                  <span className="font-medium text-stone-500">{ROLE_LABELS[role]}:</span>{" "}
                  {ROLE_DESCRIPTIONS[role]}
                </li>
              ))}
            </ul>
            {isMe && (
              <p className="mt-1.5 text-xs text-stone-400">
                You can’t change your own role. Ask another administrator.
              </p>
            )}
          </div>
          <p className="text-xs text-stone-400">
            The username can’t be changed. To rename someone, create a new account and delete this
            one.
          </p>
          <button className={primaryButtonClass}>Save</button>
        </form>
      </section>

      <section className="mt-6 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {isMe ? (
          <Panel
            title="Password"
            description="Change your own password from your account page."
          >
            <Link href="/admin/account" className={secondaryButtonClass}>
              Your account
            </Link>
          </Panel>
        ) : (
          <Panel
            title="Reset password"
            description="Generates a temporary password to give them. They’re signed out everywhere and must choose their own when they next sign in."
          >
            <ResetPasswordForm action={resetPasswordAction.bind(null, user.id)} name={user.name} />
          </Panel>
        )}

        <Panel
          title="Sessions"
          description={
            sessions.length === 0
              ? "Not signed in anywhere."
              : `Signed in on ${sessions.length} ${sessions.length === 1 ? "device" : "devices"}: ${sessions
                  .map((s) => `${describeBrowser(s.user_agent)} (${timeAgo(s.last_seen_at)})`)
                  .join(", ")}.`
          }
        >
          {sessions.length > (isMe ? 1 : 0) && (
            <form action={revokeUserSessionsAction.bind(null, user.id)}>
              <button className={secondaryButtonClass}>
                {isMe ? "Sign out other devices" : "Sign out everywhere"}
              </button>
            </form>
          )}
        </Panel>

        {!isMe && (
          <Panel
            title={user.disabled_at ? "Enable account" : "Disable account"}
            description={
              user.disabled_at
                ? `Disabled ${timeAgo(user.disabled_at)}. Enabling lets them sign in again with their existing password.`
                : "Stops them signing in and signs them out now, without deleting the account."
            }
          >
            <form action={setDisabledAction.bind(null, user.id, !user.disabled_at)}>
              {user.disabled_at ? (
                <button className={secondaryButtonClass}>Enable</button>
              ) : (
                <ConfirmButton
                  message={`Disable ${user.name}’s account? They’ll be signed out straight away.`}
                  className={dangerButtonClass}
                >
                  Disable
                </ConfirmButton>
              )}
            </form>
          </Panel>
        )}

        {!isMe && (
          <Panel
            title="Delete account"
            description="Removes the account for good. Courses they worked on are not affected, and the audit log keeps their username."
          >
            <form action={deleteUserAction.bind(null, user.id)}>
              <ConfirmButton
                message={`Delete ${user.name}’s account (${user.username})? This can’t be undone.`}
                className={dangerButtonClass}
              >
                Delete
              </ConfirmButton>
            </form>
          </Panel>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-3">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <Link href="/admin/audit" className="text-xs text-stone-500 hover:text-stone-900">
            Full audit log →
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="px-5 py-3 text-sm text-stone-400">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <span>
                  <span className="text-stone-800">{AUDIT_ACTIONS[entry.action] ?? entry.action}</span>
                  <span className="text-stone-400">
                    {entry.actor !== user.username && ` by ${entry.actor}`}
                    {entry.target && entry.target !== user.username && ` · ${entry.target}`}
                  </span>
                </span>
                <span className="text-stone-400" title={utcStamp(entry.at)}>
                  {timeAgo(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
