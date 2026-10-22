import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { utcStamp } from "@/lib/account-display";
import { AUDIT_ACTIONS, AUDIT_RETENTION_DAYS, countAudit, listAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit log",
};

const PAGE_SIZE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("admin");
  const total = countAudit();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number((await searchParams).page);
  const page = Number.isInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const entries = listAudit({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin/users" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← Users
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          Sign-ins, account changes, deletions and offline releases, newest first. Entries are
          kept for {AUDIT_RETENTION_DAYS} days.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">What</th>
              <th className="px-4 py-2.5 font-medium">Subject</th>
              <th className="px-4 py-2.5 font-medium">Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-stone-500">{utcStamp(entry.at)}</td>
                <td className="px-4 py-2.5">
                  {entry.actor_id ? (
                    <Link href={`/admin/users/${entry.actor_id}`} className="hover:text-teal-700">
                      {entry.actor}
                    </Link>
                  ) : (
                    <span className="text-stone-400">{entry.actor}</span>
                  )}
                </td>
                <td
                  className={`px-4 py-2.5 ${
                    entry.action.endsWith("_failed") || entry.action.endsWith("_locked")
                      ? "text-red-600"
                      : "text-stone-800"
                  }`}
                >
                  {AUDIT_ACTIONS[entry.action] ?? entry.action}
                </td>
                <td className="px-4 py-2.5 text-stone-600">
                  {entry.target}
                  {entry.detail && <span className="text-stone-400"> · {entry.detail}</span>}
                </td>
                <td className="px-4 py-2.5 text-stone-400">{entry.ip}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                  Nothing recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm text-stone-500">
          {page > 1 ? (
            <Link href={`/admin/audit?page=${page - 1}`} className="hover:text-stone-900">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/admin/audit?page=${page + 1}`} className="hover:text-stone-900">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
