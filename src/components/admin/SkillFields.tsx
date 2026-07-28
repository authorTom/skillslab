"use client";

import Link from "next/link";
import { useState } from "react";
import { NEW_CATEGORY } from "@/lib/taxonomy";
import { inputClass } from "./formStyles";

export interface CategoryOption {
  id: number;
  name: string;
  /** Name of the group it belongs to, or "" when it has none. */
  group: string;
}

export interface SkillDefaults {
  title: string;
  category_id: number | null;
  description: string;
}

/** Categories in the order given, split into the `<optgroup>`s they belong to. */
function byGroup(categories: CategoryOption[]): { group: string; categories: CategoryOption[] }[] {
  const sections: { group: string; categories: CategoryOption[] }[] = [];
  for (const category of categories) {
    const last = sections[sections.length - 1];
    if (last?.group === category.group) last.categories.push(category);
    else sections.push({ group: category.group, categories: [category] });
  }
  return sections;
}

export default function SkillFields({
  defaults,
  categories,
  groups,
}: {
  defaults?: SkillDefaults;
  categories: CategoryOption[];
  groups: { id: number; name: string }[];
}) {
  const [category, setCategory] = useState(String(defaults?.category_id ?? ""));
  const addingCategory = category === NEW_CATEGORY;

  return (
    <>
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-stone-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={defaults?.title}
          placeholder="e.g. Venepuncture"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="categoryId" className="mb-1.5 block text-sm font-medium text-stone-700">
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
        >
          <option value="">Uncategorised</option>
          {byGroup(categories).map((section) => (
            <optgroup key={section.group || "ungrouped"} label={section.group || "No group"}>
              {section.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={NEW_CATEGORY}>+ New category…</option>
        </select>

        {addingCategory ? (
          <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <input
              name="newCategory"
              autoFocus
              placeholder="New category name"
              aria-label="New category name"
              className={`${inputClass} min-w-40 flex-1`}
            />
            <select
              name="newCategoryGroupId"
              defaultValue=""
              aria-label="Group for the new category"
              className={`${inputClass} w-auto`}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-stone-400">
            Categories and groups are how learners browse the catalogue.{" "}
            <Link href="/admin/categories" className="underline underline-offset-2 hover:text-stone-600">
              Manage groups &amp; categories
            </Link>
          </p>
        )}
      </div>
      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-stone-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults?.description}
          placeholder="A short summary shown to learners…"
          className={inputClass}
        />
      </div>
    </>
  );
}
