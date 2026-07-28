import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listTrash, trashFiles, TRASH_RETENTION_DAYS, type TrashKind } from "@/lib/data";
import { formatBytes, publicFileSize } from "@/lib/files";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  emptyTrashAction,
  purgeExpiredTrashAction,
  purgeTrashAction,
  restoreTrashAction,
} from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<TrashKind, string> = {
  skill: "Course",
  resource: "Resource",
  thumbnail: "Thumbnail",
};

/** Whole days since an ISO-ish `YYYY-MM-DD HH:MM:SS` UTC timestamp from SQLite. */
function daysSince(deletedAt: string): number {
  const ms = Date.now() - Date.parse(`${deletedAt.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;
}

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdmin();
  await purgeExpiredTrashAction();
  const { success, error } = await searchParams;

  const items = listTrash().map((row) => {
    const files = trashFiles(row);
    return {
      row,
      fileCount: files.length,
      bytes: files.reduce((total, file) => total + publicFileSize(file), 0),
      age: daysSince(row.deleted_at),
    };
  });
  const totalBytes = items.reduce((total, item) => total + item.bytes, 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recycle bin</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Deleted courses, resources and replaced files stay here for{" "}
            {TRASH_RETENTION_DAYS} days, then are removed automatically. Deleting permanently also
            erases the uploaded files from disk, freeing the storage.
          </p>
        </div>
        {items.length > 0 && (
          <form action={emptyTrashAction}>
            <ConfirmButton
              message={`Permanently delete all ${items.length} item(s) and their files? This cannot be undone.`}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Empty bin{totalBytes > 0 && ` (frees ${formatBytes(totalBytes)})`}
            </ConfirmButton>
          </form>
        )}
      </div>

      {success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">The recycle bin is empty</p>
          <p className="mt-1 text-sm text-stone-400">
            Anything you delete will appear here so it can be recovered.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {items.map(({ row, fileCount, bytes, age }) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                    {KIND_LABELS[row.kind]}
                  </span>
                  <p className="truncate font-medium">{row.label}</p>
                </div>
                <p className="mt-0.5 text-xs text-stone-400">
                  {row.detail && `${row.detail} · `}
                  {age === 0 ? "Deleted today" : age === 1 ? "Deleted yesterday" : `Deleted ${age} days ago`}
                  {" · "}
                  {`purges in ${Math.max(0, TRASH_RETENTION_DAYS - age)} days`}
                  {fileCount > 0 && ` · ${fileCount} file${fileCount === 1 ? "" : "s"}`}
                  {bytes > 0 && ` · ${formatBytes(bytes)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <form action={restoreTrashAction.bind(null, row.id)}>
                  <button className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-700 transition hover:border-teal-300">
                    Restore
                  </button>
                </form>
                <form action={purgeTrashAction.bind(null, row.id)}>
                  <ConfirmButton
                    message={`Permanently delete “${row.label}”${
                      fileCount > 0 ? ` and its ${fileCount} file(s)` : ""
                    }? This cannot be undone.`}
                    className="rounded-lg px-3 py-1.5 text-red-600 transition hover:bg-red-50"
                  >
                    Delete forever
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
