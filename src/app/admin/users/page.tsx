import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { timeAgo, utcStamp } from "@/lib/account-display";
import { listUsers, ROLE_LABELS, type User } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Users",
};

function Status({ user }: { user: User }) {
  if (user.disabled_at) {
    return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">Disabled</span>;
  }
  if (user.must_change_password) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Temporary password
      </span>
    );
  }
  return <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Active</span>;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const me = await requireRole("admin");
  const { success } = await searchParams;
  const users = listUsers();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            The people who can sign in to manage courses. Learners don’t need an account.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/audit"
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            Audit log
          </Link>
          <Link
            href="/admin/users/new"
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            + New user
          </Link>
        </div>
      </div>

      {success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
      )}

      <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-xs font-medium text-stone-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 font-medium">Role</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium">Last signed in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((user) => (
              <tr key={user.id} className={user.disabled_at ? "text-stone-400" : ""}>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="font-medium text-stone-900 hover:text-teal-700"
                  >
                    {user.name}
                  </Link>
                  <span className="ml-2 text-stone-400">{user.username}</span>
                  {user.id === me.id && <span className="ml-2 text-xs text-stone-400">(you)</span>}
                </td>
                <td className="px-5 py-3">{ROLE_LABELS[user.role]}</td>
                <td className="px-5 py-3">
                  <Status user={user} />
                </td>
                <td
                  className="px-5 py-3 text-stone-500"
                  title={user.last_login_at ? utcStamp(user.last_login_at) : undefined}
                >
                  {timeAgo(user.last_login_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
