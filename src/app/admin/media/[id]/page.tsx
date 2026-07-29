import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatBytes, formatDimensions } from "@/lib/files";
import { getMedia, listMediaFolders, mediaUsage, type MediaUsage } from "@/lib/media";
import { MEDIA_KIND_LABELS } from "@/lib/media-types";
import ConfirmButton from "@/components/admin/ConfirmButton";
import MediaDetailForm from "@/components/admin/MediaDetailForm";
import MediaReplaceForm from "@/components/admin/MediaReplaceForm";
import MediaThumb from "@/components/admin/MediaThumb";
import { deleteMediaAction, replaceMediaAction, updateMediaAction } from "../actions";

export const dynamic = "force-dynamic";

function UsageRow({ usage }: { usage: MediaUsage }) {
  if (usage.kind === "trash") {
    return (
      <li className="px-4 py-2.5 text-sm text-stone-500">
        <Link href="/admin/trash" className="hover:text-stone-900">
          {usage.label}
        </Link>{" "}
        <span className="text-xs text-stone-400">· in the recycle bin</span>
      </li>
    );
  }
  return (
    <li className="px-4 py-2.5 text-sm">
      <Link href={`/admin/skills/${usage.skillId}`} className="font-medium hover:text-teal-700">
        {usage.skillTitle}
      </Link>
      <span className="text-stone-400">
        {usage.kind === "thumbnail" ? " · course thumbnail" : ` · ${usage.resourceTitle}`}
      </span>
    </li>
  );
}

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const media = Number.isInteger(id) ? getMedia(id) : undefined;
  if (!media) notFound();

  const usage = mediaUsage(media.id);
  const folders = listMediaFolders();
  const dimensions = formatDimensions(media.width, media.height);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/admin/media" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← Media library
      </Link>

      <h1 className="mt-4 break-all text-2xl font-semibold tracking-tight">{media.filename}</h1>
      <p className="mt-1 text-sm text-stone-400">
        {MEDIA_KIND_LABELS[media.kind]} · {formatBytes(media.bytes)}
        {dimensions && ` · ${dimensions}`} · added {media.created_at.slice(0, 10)}
      </p>

      {media.missing && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          The file behind this entry is missing from disk. Replace it below, or delete the entry once
          nothing uses it.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <MediaThumb item={media} className="aspect-[4/3] w-full object-contain" />
          </div>
          <a
            href={media.url}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            Open the file
          </a>
          <p className="text-xs text-stone-400">
            Stored on disk as <span className="break-all font-mono">{media.storage_name}</span>
          </p>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Details</h2>
            <div className="mt-5">
              <MediaDetailForm
                media={media}
                folders={folders}
                action={updateMediaAction.bind(null, media.id)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">
              Used by {usage.length === 0 ? "nothing" : usage.length === 1 ? "1 place" : `${usage.length} places`}
            </h2>
            {usage.length === 0 ? (
              <p className="mt-1 text-sm text-stone-500">
                No course points at this file, so it can be deleted.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200">
                {usage.map((entry, i) => (
                  <UsageRow key={i} usage={entry} />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Replace the file</h2>
            <p className="mt-1 text-sm text-stone-500">
              Uploads a new version in place, keeping this file&apos;s name and everything that
              points at it. The version it replaces goes to the recycle bin.
            </p>
            <div className="mt-4">
              <MediaReplaceForm
                kind={media.kind}
                action={replaceMediaAction.bind(null, media.id)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Delete this file</h2>
            <p className="mt-1 text-sm text-stone-500">
              {usage.length > 0
                ? "It is still in use, so it can't be deleted yet — remove it from the courses listed above first."
                : "It moves to the recycle bin, where it can be restored until it is deleted permanently."}
            </p>
            <form action={deleteMediaAction.bind(null, media.id)} className="mt-4">
              <ConfirmButton
                message={`Move “${media.filename}” to the recycle bin?`}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                disabled={usage.length > 0}
              >
                Move to recycle bin
              </ConfirmButton>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
