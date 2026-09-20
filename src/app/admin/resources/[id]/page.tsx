import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getResource, getSkillById } from "@/lib/data";
import { getMedia, getMediaMap } from "@/lib/media";
import { parseMediaRef } from "@/lib/media-refs";
import { parseStoryboardFrames } from "@/lib/storyboard";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";
import { ResourceIcon } from "@/components/ResourceIcon";
import ConfirmButton from "@/components/admin/ConfirmButton";
import EditResourceForm from "@/components/admin/EditResourceForm";
import { deleteResourceAction, updateResourceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const resource = Number.isInteger(id) ? getResource(id) : undefined;
  if (!resource) notFound();
  const skill = getSkillById(resource.skill_id);
  if (!skill) notFound();

  // The form edits library references, so it needs the files themselves.
  const file =
    resource.type === "pdf" || resource.type === "image" || resource.type === "local_video"
      ? getMedia(parseMediaRef(resource.content) ?? 0)
      : undefined;
  const frames = resource.type === "storyboard" ? parseStoryboardFrames(resource.content) : [];
  const frameMedia = getMediaMap(frames.map((frame) => frame.media_id));
  const steps = frames.flatMap((frame) => {
    const media = frameMedia.get(frame.media_id);
    return media ? [{ media, caption: frame.caption }] : [];
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href={`/admin/skills/${skill.id}`}
        className="text-sm text-stone-500 transition hover:text-stone-900"
      >
        ← {skill.title}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <ResourceIcon type={resource.type} className="h-5 w-5 shrink-0 text-stone-400" />
        <h1 className="text-2xl font-semibold tracking-tight">Edit resource</h1>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        {RESOURCE_TYPE_LABELS[resource.type]} · a resource&apos;s type can&apos;t be changed — remove
        it and add a new one instead.
      </p>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <EditResourceForm
          resource={resource}
          file={file}
          steps={steps}
          action={updateResourceAction.bind(null, resource.id)}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Remove this resource</h2>
        <p className="mt-1 text-sm text-stone-500">
          It moves to the{" "}
          <Link href="/admin/trash" className="text-teal-700 underline underline-offset-2">
            recycle bin
          </Link>
          , where it can be restored until it is deleted permanently.
        </p>
        <form action={deleteResourceAction.bind(null, resource.id)} className="mt-4">
          <ConfirmButton
            message={`Move “${resource.title}” to the recycle bin?`}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Move to recycle bin
          </ConfirmButton>
        </form>
      </section>
    </main>
  );
}
