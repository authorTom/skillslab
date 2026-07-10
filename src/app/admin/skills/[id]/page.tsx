import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSkillById, listResources } from "@/lib/data";
import { ResourceIcon, RESOURCE_TYPE_LABELS } from "@/components/ResourceIcon";
import AddResourceForm from "@/components/admin/AddResourceForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import SkillForm from "@/components/admin/SkillForm";
import {
  addResourceAction,
  deleteResourceAction,
  moveResourceAction,
  updateSkillAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditSkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdmin();
  const { id: idParam } = await params;
  const { created } = await searchParams;
  const id = Number(idParam);
  const skill = Number.isInteger(id) ? getSkillById(id) : undefined;
  if (!skill) notFound();
  const resources = listResources(skill.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
          ← All courses
        </Link>
        <Link
          href={`/skills/${skill.slug}`}
          className="text-sm text-teal-700 transition hover:text-teal-800"
        >
          View as learner →
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{skill.title}</h1>

      {created && (
        <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          Skill created. Now add its learning resources below.
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Details</h2>
        <div className="mt-5">
          <SkillForm
            action={updateSkillAction.bind(null, skill.id)}
            defaults={skill}
            currentThumbnail={skill.thumbnail || undefined}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Resources</h2>
        <p className="mt-1 text-sm text-stone-500">
          Shown to learners in this order. Use the arrows to reorder.
        </p>

        {resources.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
            No resources yet — add one below.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-stone-100 rounded-xl border border-stone-200">
            {resources.map((resource, i) => (
              <li key={resource.id} className="flex items-center gap-3 px-4 py-3">
                <ResourceIcon type={resource.type} className="h-4 w-4 shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{resource.title}</p>
                  <p className="text-xs text-stone-400">{RESOURCE_TYPE_LABELS[resource.type]}</p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={moveResourceAction.bind(null, resource.id, -1 as const)}>
                    <button
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveResourceAction.bind(null, resource.id, 1 as const)}>
                    <button
                      disabled={i === resources.length - 1}
                      aria-label="Move down"
                      className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </form>
                  <form action={deleteResourceAction.bind(null, resource.id)}>
                    <ConfirmButton
                      message={`Remove “${resource.title}”?`}
                      className="rounded-lg px-2.5 py-1 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 border-t border-stone-100 pt-6">
          <h3 className="mb-4 text-sm font-semibold">Add a resource</h3>
          <AddResourceForm skillId={skill.id} action={addResourceAction} />
        </div>
      </section>
    </main>
  );
}
