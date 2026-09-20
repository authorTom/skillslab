import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listReleases } from "@/lib/offline/releases";
import ConfirmButton from "@/components/admin/ConfirmButton";
import BuildReleaseForm from "./BuildReleaseForm";
import { buildReleaseAction, deleteReleaseAction, markCurrentAction } from "./actions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function ReleasesPage() {
  await requireAdmin();
  const releases = listReleases();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Offline releases</h1>
          <p className="mt-1 text-sm text-stone-500">
            Build content packages for the iPad reader app.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-stone-500 transition hover:text-stone-900"
        >
          ← Back to courses
        </Link>
      </div>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Build a new release</h2>
        <p className="mt-1 text-sm text-stone-500">
          Exports all skills, resources, and media into an offline content package. The new release
          is automatically marked as current.
        </p>
        <div className="mt-4">
          <BuildReleaseForm action={buildReleaseAction} />
        </div>
      </section>

      {releases.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Previous releases
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <ul className="divide-y divide-stone-200">
              {releases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      v{r.version}
                      {r.current && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                          Current
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {formatDate(r.createdAt)} · {r.counts.skills} skills ·{" "}
                      {r.counts.resources} resources · {formatBytes(r.totalBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {!r.current && (
                      <form action={markCurrentAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-700 transition hover:border-teal-300"
                        >
                          Set current
                        </button>
                      </form>
                    )}
                    <form action={deleteReleaseAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        message={`Permanently delete release v${r.version}?`}
                        className="rounded-lg px-3 py-1.5 text-red-600 transition hover:bg-red-50"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
