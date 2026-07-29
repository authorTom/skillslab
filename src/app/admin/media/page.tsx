import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatBytes } from "@/lib/files";
import {
  countMedia,
  countUnfiledMedia,
  listMedia,
  listMediaFolders,
  listMediaTags,
  mediaUsageIndex,
  type MediaKind,
  type MediaSort,
} from "@/lib/media";
import ConfirmButton from "@/components/admin/ConfirmButton";
import MediaGrid from "@/components/admin/MediaGrid";
import MediaUploadZone from "@/components/admin/MediaUploadZone";
import { inputClass } from "@/components/admin/formStyles";
import { purgeExpiredTrashAction } from "../actions";
import { createFolderAction, deleteFolderAction, renameFolderAction } from "./actions";

export const dynamic = "force-dynamic";

type Search = {
  q?: string;
  kind?: string;
  folder?: string;
  tag?: string;
  sort?: string;
  success?: string;
  error?: string;
};

const SORT_LABELS: Record<MediaSort, string> = {
  recent: "Newest first",
  name: "Name",
  size: "Largest first",
};

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  await purgeExpiredTrashAction();
  const params = await searchParams;

  const kind = params.kind === "image" || params.kind === "pdf" ? (params.kind as MediaKind) : undefined;
  const sort: MediaSort =
    params.sort === "name" || params.sort === "size" ? (params.sort as MediaSort) : "recent";
  const folder =
    params.folder === "none" ? ("none" as const) : params.folder ? Number(params.folder) : undefined;
  const tag = params.tag ? Number(params.tag) : undefined;

  const items = listMedia({ q: params.q, kind, folder, tag, sort });
  const folders = listMediaFolders();
  const tags = listMediaTags();
  const unfiled = countUnfiledMedia();
  const totals = countMedia();
  const activeFolder = typeof folder === "number" ? folders.find((f) => f.id === folder) : undefined;

  const usageIndex = mediaUsageIndex();
  const usage = Object.fromEntries(
    items.map((item) => [item.id, (usageIndex.get(item.id) ?? []).length])
  );

  /** Keeps the current filters when only one of them changes. */
  const href = (changes: Partial<Record<keyof Search, string | undefined>>) => {
    const query = new URLSearchParams();
    const merged = { q: params.q, kind: params.kind, folder: params.folder, tag: params.tag, sort: params.sort, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
    const string = query.toString();
    return `/admin/media${string ? `?${string}` : ""}`;
  };

  const sideLinkClass = (active: boolean) =>
    `flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
      active ? "bg-teal-50 font-medium text-teal-800" : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media library</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Every uploaded file, shared across courses. Renaming a file here is safe — courses point
            at the file itself, not its name.
          </p>
        </div>
        <p className="text-sm text-stone-400">
          {totals.files} {totals.files === 1 ? "file" : "files"} · {formatBytes(totals.bytes)}
        </p>
      </div>

      {params.success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{params.success}</p>
      )}
      {params.error && (
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      <div className="mt-6">
        <MediaUploadZone folderId={activeFolder?.id ?? null} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Folders
            </h2>
            <ul className="space-y-0.5">
              <li>
                <Link href={href({ folder: undefined })} className={sideLinkClass(!params.folder)}>
                  <span>All files</span>
                  <span className="text-xs text-stone-400">{totals.files}</span>
                </Link>
              </li>
              {folders.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={href({ folder: String(entry.id) })}
                    className={sideLinkClass(activeFolder?.id === entry.id)}
                  >
                    <span className="truncate">{entry.name}</span>
                    <span className="text-xs text-stone-400">{entry.media_count}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={href({ folder: "none" })}
                  className={sideLinkClass(params.folder === "none")}
                >
                  <span>Unfiled</span>
                  <span className="text-xs text-stone-400">{unfiled}</span>
                </Link>
              </li>
            </ul>

            <form action={createFolderAction} className="mt-3 flex gap-2">
              <input
                name="name"
                placeholder="New folder"
                aria-label="New folder name"
                className={`${inputClass} py-1.5`}
              />
              <button className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300">
                Add
              </button>
            </form>

            {activeFolder && (
              <div className="mt-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <form action={renameFolderAction.bind(null, activeFolder.id)} className="flex gap-2">
                  <input
                    name="name"
                    defaultValue={activeFolder.name}
                    aria-label={`Rename ${activeFolder.name}`}
                    className={`${inputClass} py-1.5`}
                  />
                  <button className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300">
                    Save
                  </button>
                </form>
                <form action={deleteFolderAction.bind(null, activeFolder.id)}>
                  <ConfirmButton
                    message={`Delete the folder “${activeFolder.name}”? Its files stay in the library, unfiled.`}
                    className="text-xs text-red-600 transition hover:underline"
                  >
                    Delete this folder
                  </ConfirmButton>
                </form>
              </div>
            )}
          </div>

          {tags.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Tags
              </h2>
              <ul className="space-y-0.5">
                {tags.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={href({ tag: tag === entry.id ? undefined : String(entry.id) })}
                      className={sideLinkClass(tag === entry.id)}
                    >
                      <span className="truncate">{entry.name}</span>
                      <span className="text-xs text-stone-400">{entry.media_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          <form className="mb-5 flex flex-wrap items-center gap-2">
            {params.folder && <input type="hidden" name="folder" value={params.folder} />}
            {params.tag && <input type="hidden" name="tag" value={params.tag} />}
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by name, title or alt text…"
              aria-label="Search the media library"
              className={`${inputClass} w-auto min-w-56 flex-1 py-2`}
            />
            <select
              name="kind"
              defaultValue={params.kind ?? ""}
              aria-label="Filter by type"
              className={`${inputClass} w-auto py-2`}
            >
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="pdf">PDFs</option>
            </select>
            <select
              name="sort"
              defaultValue={sort}
              aria-label="Sort files"
              className={`${inputClass} w-auto py-2`}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300">
              Apply
            </button>
            {(params.q || params.kind || params.tag || params.folder) && (
              <Link
                href="/admin/media"
                className="rounded-xl px-3 py-2 text-sm text-stone-500 transition hover:bg-stone-100"
              >
                Clear
              </Link>
            )}
          </form>

          <MediaGrid items={items} folders={folders} usage={usage} />
        </div>
      </div>
    </main>
  );
}
