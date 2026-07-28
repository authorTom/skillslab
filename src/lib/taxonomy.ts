// Small shared pieces of the group/category feature. Kept free of database
// imports so client components can use them too.

/** Sentinel for the "create a new category" option in the course form. */
export const NEW_CATEGORY = "__new";

/** "Group › Category" for display, falling back to "Uncategorised". */
export function categoryPath(
  groupName: string | null | undefined,
  categoryName: string | null | undefined
): string {
  return [groupName, categoryName].filter(Boolean).join(" › ") || "Uncategorised";
}
