import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listGroupsWithCategories, type CategoryWithCount, type Group } from "@/lib/data";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { inputClass, primaryButtonClass } from "@/components/admin/formStyles";
import {
  createCategoryAction,
  createGroupAction,
  deleteCategoryAction,
  deleteGroupAction,
  moveCategoryAction,
  moveGroupAction,
  updateCategoryAction,
  updateGroupAction,
} from "../actions";

export const dynamic = "force-dynamic";

const rowInputClass = `${inputClass} py-1.5`;
const moveButtonClass =
  "rounded-lg border border-stone-200 px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30";
const saveButtonClass =
  "rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300";
const deleteButtonClass = "rounded-lg px-2.5 py-1.5 text-sm text-red-600 transition hover:bg-red-50";

function courseCount(n: number): string {
  return n === 1 ? "1 course" : `${n} courses`;
}

/** Editable row for one category: rename, move between groups, reorder, delete. */
function CategoryRow({
  category,
  groups,
  isFirst,
  isLast,
}: {
  category: CategoryWithCount;
  groups: Group[];
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3">
      <form
        action={updateCategoryAction.bind(null, category.id)}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      >
        <input
          name="name"
          defaultValue={category.name}
          aria-label="Category name"
          className={`${rowInputClass} min-w-40 flex-1`}
        />
        <select
          name="groupId"
          defaultValue={category.group_id ?? ""}
          aria-label="Group"
          className={`${rowInputClass} w-auto`}
        >
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <button className={saveButtonClass}>Save</button>
      </form>
      <span className="text-xs text-stone-400">{courseCount(category.skill_count)}</span>
      <div className="flex items-center gap-1">
        <form action={moveCategoryAction.bind(null, category.id, -1 as const)}>
          <button disabled={isFirst} aria-label="Move category up" className={moveButtonClass}>
            ↑
          </button>
        </form>
        <form action={moveCategoryAction.bind(null, category.id, 1 as const)}>
          <button disabled={isLast} aria-label="Move category down" className={moveButtonClass}>
            ↓
          </button>
        </form>
        <form action={deleteCategoryAction.bind(null, category.id)}>
          <ConfirmButton
            message={
              category.skill_count === 0
                ? `Delete the category “${category.name}”?`
                : `Delete the category “${category.name}”? Its ${courseCount(
                    category.skill_count
                  )} will become uncategorised — no course is deleted.`
            }
            className={deleteButtonClass}
          >
            Delete
          </ConfirmButton>
        </form>
      </div>
    </li>
  );
}

function AddCategoryForm({ groupId }: { groupId: number | "" }) {
  return (
    <form action={createCategoryAction} className="flex flex-wrap items-center gap-2 px-4 py-3">
      <input type="hidden" name="groupId" value={groupId} />
      <input
        name="name"
        placeholder="New category name…"
        aria-label="New category name"
        className={`${rowInputClass} min-w-40 flex-1`}
      />
      <button className={saveButtonClass}>+ Add category</button>
    </form>
  );
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdmin();
  const { success, error } = await searchParams;
  const { groups, ungrouped } = listGroupsWithCategories();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Groups &amp; categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          Courses sit in a category, and categories sit in a group — that&apos;s how learners
          browse and filter the catalogue. The order you set here is the order they see. Deleting a
          group or category never deletes a course.
        </p>
      </div>

      {success && (
        <p className="mt-6 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">New group</h2>
        <form action={createGroupAction} className="mt-4 flex flex-wrap items-start gap-2">
          <input
            name="name"
            placeholder="e.g. Core clinical skills"
            aria-label="Group name"
            className={`${inputClass} min-w-48 flex-1`}
          />
          <input
            name="description"
            placeholder="Short description (optional)"
            aria-label="Group description"
            className={`${inputClass} min-w-48 flex-1`}
          />
          <button className={primaryButtonClass}>Create group</button>
        </form>
      </section>

      {groups.map((group, i) => (
        <section
          key={group.id}
          className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-stone-50 px-4 py-3">
            <form
              action={updateGroupAction.bind(null, group.id)}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
            >
              <input
                name="name"
                defaultValue={group.name}
                aria-label="Group name"
                className={`${rowInputClass} min-w-40 flex-1 font-medium`}
              />
              <input
                name="description"
                defaultValue={group.description}
                placeholder="Description (optional)"
                aria-label="Group description"
                className={`${rowInputClass} min-w-40 flex-1`}
              />
              <button className={saveButtonClass}>Save</button>
            </form>
            <span className="text-xs text-stone-400">{courseCount(group.skill_count)}</span>
            <div className="flex items-center gap-1">
              <form action={moveGroupAction.bind(null, group.id, -1 as const)}>
                <button disabled={i === 0} aria-label="Move group up" className={moveButtonClass}>
                  ↑
                </button>
              </form>
              <form action={moveGroupAction.bind(null, group.id, 1 as const)}>
                <button
                  disabled={i === groups.length - 1}
                  aria-label="Move group down"
                  className={moveButtonClass}
                >
                  ↓
                </button>
              </form>
              <form action={deleteGroupAction.bind(null, group.id)}>
                <ConfirmButton
                  message={`Delete the group “${group.name}”? Its ${
                    group.categories.length === 1
                      ? "category stays"
                      : `${group.categories.length} categories stay`
                  } — they just move out of any group.`}
                  className={deleteButtonClass}
                >
                  Delete
                </ConfirmButton>
              </form>
            </div>
          </div>

          <ul className="divide-y divide-stone-100">
            {group.categories.map((category, j) => (
              <CategoryRow
                key={category.id}
                category={category}
                groups={groups}
                isFirst={j === 0}
                isLast={j === group.categories.length - 1}
              />
            ))}
            {group.categories.length === 0 && (
              <li className="px-4 py-3 text-sm text-stone-400">
                No categories in this group yet.
              </li>
            )}
          </ul>

          <div className="border-t border-stone-100 bg-stone-50/60">
            <AddCategoryForm groupId={group.id} />
          </div>
        </section>
      ))}

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 bg-stone-50 px-4 py-3">
          <h2 className="text-sm font-medium">Categories without a group</h2>
          <p className="mt-0.5 text-xs text-stone-400">
            Shown to learners under “Other courses”. Assign one to a group above to file it away.
          </p>
        </div>
        <ul className="divide-y divide-stone-100">
          {ungrouped.map((category, i) => (
            <CategoryRow
              key={category.id}
              category={category}
              groups={groups}
              isFirst={i === 0}
              isLast={i === ungrouped.length - 1}
            />
          ))}
          {ungrouped.length === 0 && (
            <li className="px-4 py-3 text-sm text-stone-400">Every category is in a group.</li>
          )}
        </ul>
        <div className="border-t border-stone-100 bg-stone-50/60">
          <AddCategoryForm groupId="" />
        </div>
      </section>
    </main>
  );
}
