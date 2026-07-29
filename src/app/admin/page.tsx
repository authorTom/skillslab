import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { countTrash, groupSkills, listSkills, type SkillWithCount } from "@/lib/data";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { deleteSkillAction, purgeExpiredTrashAction } from "./actions";

export const dynamic = "force-dynamic";

function SkillRow({ skill }: { skill: SkillWithCount }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{skill.title}</p>
        <p className="mt-0.5 text-xs text-stone-400">
          {skill.resource_count === 1 ? "1 resource" : `${skill.resource_count} resources`}
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/skills/${skill.slug}`}
          className="rounded-lg px-3 py-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
        >
          View
        </Link>
        <Link
          href={`/admin/skills/${skill.id}`}
          className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-700 transition hover:border-teal-300"
        >
          Edit
        </Link>
        <form action={deleteSkillAction.bind(null, skill.id)}>
          <ConfirmButton
            message={`Move “${skill.title}” and all its resources to the recycle bin?`}
            className="rounded-lg px-3 py-1.5 text-red-600 transition hover:bg-red-50"
          >
            Delete
          </ConfirmButton>
        </form>
      </div>
    </li>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  await purgeExpiredTrashAction();
  const skills = listSkills();
  const sections = groupSkills(skills);
  const trashCount = countTrash();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-stone-500">
            Add, edit or remove clinical skills and their learning resources.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/categories"
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            Groups &amp; categories
          </Link>
          <Link
            href="/admin/media"
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            Media library
          </Link>
          <Link
            href="/admin/trash"
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            Recycle bin{trashCount > 0 && ` (${trashCount})`}
          </Link>
          <Link
            href="/admin/skills/new"
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            + New skill
          </Link>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">No skills yet</p>
          <p className="mt-1 text-sm text-stone-400">Create your first skill to get started.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {sections.map((group) => (
            <section key={group.key}>
              {group.name && (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  {group.name}
                </h2>
              )}
              <div className={`space-y-4 ${group.name ? "mt-3" : ""}`}>
                {group.categories.map((category) => (
                  <div
                    key={category.key}
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-2.5">
                      <h3 className="text-sm font-medium">{category.name}</h3>
                      <span className="text-xs text-stone-400">
                        {category.skills.length === 1
                          ? "1 course"
                          : `${category.skills.length} courses`}
                      </span>
                    </div>
                    <ul className="divide-y divide-stone-200">
                      {category.skills.map((skill) => (
                        <SkillRow key={skill.id} skill={skill} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
