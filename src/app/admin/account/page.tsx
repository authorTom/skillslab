import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { describeBrowser, timeAgo, utcStamp } from "@/lib/account-display";
import { listUserSessions, SESSION_IDLE_MS, SESSION_MAX_MS } from "@/lib/sessions";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/users";
import { ChangePasswordForm } from "@/components/admin/AccountForms";
import { changePasswordAction, signOutOtherSessionsAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
};

function hours(ms: number): string {
  const h = Math.round((ms / 3_600_000) * 10) / 10;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const user = await requireUser();
  const { success } = await searchParams;
  const sessions = listUserSessions(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="mt-1 text-sm text-stone-500">
          Signed in as <span className="font-medium text-stone-700">{user.username}</span> ·{" "}
          {ROLE_LABELS[user.role]} — {ROLE_DESCRIPTIONS[user.role]}
        </p>
      </div>

      {success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
      )}

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-stone-500">
          Changing it signs you out on every other device.
        </p>
        <div className="mt-5 max-w-sm">
          <ChangePasswordForm action={changePasswordAction} />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-medium">Where you’re signed in</h2>
            <p className="mt-0.5 text-xs text-stone-400">
              Each ends after {hours(SESSION_IDLE_MS)} without activity, and{" "}
              {hours(SESSION_MAX_MS)} after signing in.
            </p>
          </div>
          {sessions.length > 1 && (
            <form action={signOutOtherSessionsAction}>
              <button className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-teal-300">
                Sign out everywhere else
              </button>
            </form>
          )}
        </div>
        <ul className="divide-y divide-stone-100">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium text-stone-800">
                {describeBrowser(session.user_agent)}
                {session.id === user.sessionId && (
                  <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                    This device
                  </span>
                )}
              </span>
              <span className="text-stone-500" title={utcStamp(session.last_seen_at)}>
                {session.ip && `${session.ip} · `}active {timeAgo(session.last_seen_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
