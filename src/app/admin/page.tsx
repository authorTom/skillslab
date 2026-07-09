import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listSkills } from "@/lib/data";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { deleteSkillAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const skills = listSkills();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-stone-500">
            Add, edit or remove clinical skills and their learning resources.
          </p>
        </div>
        <Link
          href="/admin/skills/new"
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
        >
          + New skill
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">No skills yet</p>
          <p className="mt-1 text-sm text-stone-400">Create your first skill to get started.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{skill.title}</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {skill.category || "Uncategorised"} ·{" "}
                  {skill.resource_count === 1
                    ? "1 resource"
                    : `${skill.resource_count} resources`}
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
                    message={`Delete “${skill.title}” and all its resources? This cannot be undone.`}
                    className="rounded-lg px-3 py-1.5 text-red-600 transition hover:bg-red-50"
                  >
                    Delete
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
