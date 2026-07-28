import { getDb } from "./db";
import { slugify } from "./slug";

export type ResourceType = "pdf" | "image" | "storyboard" | "video";

/** Top level of the taxonomy — a named set of categories. */
export interface Group {
  id: number;
  slug: string;
  name: string;
  description: string;
  position: number;
}

/** Second level — courses live here. `group_id` is null for a loose category. */
export interface Category {
  id: number;
  group_id: number | null;
  slug: string;
  name: string;
  description: string;
  position: number;
}

export interface CategoryWithCount extends Category {
  group_name: string | null;
  group_slug: string | null;
  skill_count: number;
}

export interface GroupWithCategories extends Group {
  categories: CategoryWithCount[];
  skill_count: number;
}

export interface Skill {
  id: number;
  slug: string;
  title: string;
  category_id: number | null;
  description: string;
  thumbnail: string;
  created_at: string;
  /** Resolved from `category_id`; null when the course is uncategorised. */
  category_name: string | null;
  category_slug: string | null;
  group_name: string | null;
  group_slug: string | null;
}

export interface SkillWithCount extends Skill {
  resource_count: number;
}

export interface Resource {
  id: number;
  skill_id: number;
  type: ResourceType;
  title: string;
  content: string;
  position: number;
}

export interface SkillFilter {
  /** Free-text search over title, description and category name. */
  q?: string;
  /** Category slug. */
  category?: string;
  /** Group slug — matches every course in any of the group's categories. */
  group?: string;
}

const SKILL_COLUMNS = `s.*, c.name AS category_name, c.slug AS category_slug,
         g.name AS group_name, g.slug AS group_slug`;

const SKILL_SOURCE = `FROM skills s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN skill_groups g ON g.id = c.group_id`;

export function listSkills(filter: SkillFilter = {}): SkillWithCount[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.q) {
    clauses.push("(s.title LIKE ? OR s.description LIKE ? OR c.name LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.category) {
    clauses.push("c.slug = ?");
    params.push(filter.category);
  }
  if (filter.group) {
    clauses.push("g.slug = ?");
    params.push(filter.group);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT ${SKILL_COLUMNS}, COUNT(r.id) AS resource_count
       ${SKILL_SOURCE}
       LEFT JOIN resources r ON r.skill_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.title COLLATE NOCASE`
    )
    .all(...params) as SkillWithCount[];
}

export function getSkillBySlug(slug: string): Skill | undefined {
  return getDb()
    .prepare(`SELECT ${SKILL_COLUMNS} ${SKILL_SOURCE} WHERE s.slug = ?`)
    .get(slug) as Skill | undefined;
}

export function getSkillById(id: number): Skill | undefined {
  return getDb()
    .prepare(`SELECT ${SKILL_COLUMNS} ${SKILL_SOURCE} WHERE s.id = ?`)
    .get(id) as Skill | undefined;
}

/* ------------------------------------------------------------------ */
/* Groups & categories                                                 */
/* ------------------------------------------------------------------ */

export function listGroups(): Group[] {
  return getDb()
    .prepare("SELECT * FROM skill_groups ORDER BY position, name COLLATE NOCASE")
    .all() as Group[];
}

export function getGroup(id: number): Group | undefined {
  return getDb().prepare("SELECT * FROM skill_groups WHERE id = ?").get(id) as Group | undefined;
}

export function getGroupBySlug(slug: string): Group | undefined {
  return getDb().prepare("SELECT * FROM skill_groups WHERE slug = ?").get(slug) as
    | Group
    | undefined;
}

/** Every category, in browse order: by group, then by position within it. */
export function listCategories(): CategoryWithCount[] {
  return getDb()
    .prepare(
      `SELECT c.*, g.name AS group_name, g.slug AS group_slug, COUNT(s.id) AS skill_count
       FROM categories c
       LEFT JOIN skill_groups g ON g.id = c.group_id
       LEFT JOIN skills s ON s.category_id = c.id
       GROUP BY c.id
       ORDER BY (c.group_id IS NULL), g.position, g.name COLLATE NOCASE,
                c.position, c.name COLLATE NOCASE`
    )
    .all() as CategoryWithCount[];
}

/** Categories flattened for the course form's `<select>`, in browse order. */
export function categoryOptions(): { id: number; name: string; group: string }[] {
  return listCategories().map((c) => ({ id: c.id, name: c.name, group: c.group_name ?? "" }));
}

export function getCategory(id: number): Category | undefined {
  return getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category | undefined;
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return getDb().prepare("SELECT * FROM categories WHERE slug = ?").get(slug) as
    | Category
    | undefined;
}

/** The taxonomy as a tree, plus the categories that aren't in any group. */
export function listGroupsWithCategories(): {
  groups: GroupWithCategories[];
  ungrouped: CategoryWithCount[];
} {
  const categories = listCategories();
  const groups = listGroups().map((group) => {
    const own = categories.filter((c) => c.group_id === group.id);
    return {
      ...group,
      categories: own,
      skill_count: own.reduce((total, c) => total + c.skill_count, 0),
    };
  });
  return { groups, ungrouped: categories.filter((c) => c.group_id === null) };
}

export function createGroup(name: string, description: string): number {
  const db = getDb();
  const next = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM skill_groups").get() as {
    p: number;
  };
  return Number(
    db
      .prepare("INSERT INTO skill_groups (slug, name, description, position) VALUES (?, ?, ?, ?)")
      .run(uniqueSlugIn("skill_groups", name), name, description, next.p).lastInsertRowid
  );
}

export function updateGroup(id: number, name: string, description: string) {
  getDb()
    .prepare("UPDATE skill_groups SET slug = ?, name = ?, description = ? WHERE id = ?")
    .run(uniqueSlugIn("skill_groups", name, id), name, description, id);
}

/** Deletes a group; its categories (and their courses) survive, ungrouped. */
export function deleteGroup(id: number) {
  getDb().prepare("DELETE FROM skill_groups WHERE id = ?").run(id);
}

export function createCategory(name: string, groupId: number | null, description: string): number {
  const db = getDb();
  const next = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories
       WHERE group_id IS ?`
    )
    .get(groupId) as { p: number };
  return Number(
    db
      .prepare(
        "INSERT INTO categories (group_id, slug, name, description, position) VALUES (?, ?, ?, ?, ?)"
      )
      .run(groupId, uniqueSlugIn("categories", name), name, description, next.p).lastInsertRowid
  );
}

export function updateCategory(
  id: number,
  name: string,
  groupId: number | null,
  description: string
) {
  const db = getDb();
  const current = getCategory(id);
  if (!current) return;
  // Moving to another group puts the category at the end of that group's list.
  const position =
    current.group_id === groupId
      ? current.position
      : (
          db
            .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories WHERE group_id IS ?")
            .get(groupId) as { p: number }
        ).p;
  db.prepare(
    "UPDATE categories SET group_id = ?, slug = ?, name = ?, description = ?, position = ? WHERE id = ?"
  ).run(groupId, uniqueSlugIn("categories", name, id), name, description, position, id);
}

/** Deletes a category; its courses stay, but become uncategorised. */
export function deleteCategory(id: number) {
  getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function countSkillsInCategory(id: number): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM skills WHERE category_id = ?").get(id) as {
      n: number;
    }
  ).n;
}

/** Swaps a group with its neighbour above (-1) or below (+1). */
export function moveGroup(id: number, direction: -1 | 1) {
  reorder(
    listGroups(),
    id,
    direction,
    getDb().prepare("UPDATE skill_groups SET position = ? WHERE id = ?")
  );
}

/** Swaps a category with its neighbour inside the same group. */
export function moveCategory(id: number, direction: -1 | 1) {
  const category = getCategory(id);
  if (!category) return;
  const siblings = listCategories().filter((c) => c.group_id === category.group_id);
  reorder(siblings, id, direction, getDb().prepare("UPDATE categories SET position = ? WHERE id = ?"));
}

/**
 * Moves one row of `siblings` one place up or down. Every position is
 * normalised on the way, so legacy ties can't stick two rows together.
 */
function reorder(
  siblings: { id: number }[],
  id: number,
  direction: -1 | 1,
  update: { run: (position: number, id: number) => unknown }
) {
  const index = siblings.findIndex((s) => s.id === id);
  const target = siblings[index + direction];
  if (index === -1 || !target) return;
  getDb().transaction(() => {
    siblings.forEach((s, i) => update.run(i, s.id));
    update.run(index + direction, id);
    update.run(index, target.id);
  })();
}

/** Finds a category by name, creating it (and its group) if it has gone. */
export function findOrCreateCategory(name: string, groupName?: string): number | null {
  if (!name) return null;
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE")
    .get(name) as { id: number } | undefined;
  if (existing) return existing.id;

  let groupId: number | null = null;
  if (groupName) {
    const group = db.prepare("SELECT id FROM skill_groups WHERE name = ? COLLATE NOCASE").get(
      groupName
    ) as { id: number } | undefined;
    groupId = group?.id ?? createGroup(groupName, "");
  }
  return createCategory(name, groupId, "");
}

/* ------------------------------------------------------------------ */
/* Browsing                                                            */
/* ------------------------------------------------------------------ */

export interface BrowseCategory {
  key: string;
  name: string;
  /** Null for the "no category" bucket, which has nothing to link to. */
  slug: string | null;
  skills: SkillWithCount[];
}

export interface BrowseGroup {
  key: string;
  name: string;
  slug: string | null;
  description: string;
  categories: BrowseCategory[];
}

/**
 * Arranges courses into group → category sections for browsing, in the order
 * the admin arranged them. Empty sections are dropped, and anything without a
 * category (or a group) is collected into a trailing bucket.
 */
export function groupSkills(skills: SkillWithCount[]): BrowseGroup[] {
  const byCategory = new Map<number, SkillWithCount[]>();
  const uncategorised: SkillWithCount[] = [];
  for (const skill of skills) {
    if (skill.category_id === null) uncategorised.push(skill);
    else byCategory.set(skill.category_id, [...(byCategory.get(skill.category_id) ?? []), skill]);
  }

  const section = (category: CategoryWithCount): BrowseCategory | null => {
    const own = byCategory.get(category.id);
    return own?.length ? { key: `c${category.id}`, name: category.name, slug: category.slug, skills: own } : null;
  };
  const isSection = (c: BrowseCategory | null): c is BrowseCategory => c !== null;

  const { groups, ungrouped } = listGroupsWithCategories();
  const sections: BrowseGroup[] = groups
    .map((group) => ({
      key: `g${group.id}`,
      name: group.name,
      slug: group.slug,
      description: group.description,
      categories: group.categories.map(section).filter(isSection),
    }))
    .filter((group) => group.categories.length > 0);

  const looseCategories = ungrouped.map(section).filter(isSection);
  if (uncategorised.length) {
    looseCategories.push({
      key: "uncategorised",
      name: "Uncategorised",
      slug: null,
      skills: uncategorised,
    });
  }
  if (looseCategories.length) {
    sections.push({
      key: "other",
      name: sections.length ? "Other courses" : "",
      slug: null,
      description: "",
      categories: looseCategories,
    });
  }
  return sections;
}

export function listResources(skillId: number): Resource[] {
  return getDb()
    .prepare("SELECT * FROM resources WHERE skill_id = ? ORDER BY position, id")
    .all(skillId) as Resource[];
}

export function getResource(id: number): Resource | undefined {
  return getDb().prepare("SELECT * FROM resources WHERE id = ?").get(id) as Resource | undefined;
}

/** Slug for `title` that no other row in `table` holds. */
function uniqueSlugIn(
  table: "skills" | "categories" | "skill_groups",
  title: string,
  excludeId?: number
): string {
  const base = slugify(title);
  const taken = getDb().prepare(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`);
  let slug = base;
  let n = 2;
  while (taken.get(slug, excludeId ?? -1)) slug = `${base}-${n++}`;
  return slug;
}

export function uniqueSlug(title: string, excludeId?: number): string {
  return uniqueSlugIn("skills", title, excludeId);
}

/** True when no *other* skill already holds this slug. */
export function slugAvailable(slug: string, excludeId?: number): boolean {
  return !getDb()
    .prepare("SELECT id FROM skills WHERE slug = ? AND id <> ?")
    .get(slug, excludeId ?? -1);
}

export function createSkill(title: string, categoryId: number | null, description: string): number {
  const slug = uniqueSlug(title);
  const result = getDb()
    .prepare("INSERT INTO skills (slug, title, category_id, description) VALUES (?, ?, ?, ?)")
    .run(slug, title, categoryId, description);
  return Number(result.lastInsertRowid);
}

export function updateSkill(
  id: number,
  title: string,
  categoryId: number | null,
  description: string
) {
  const slug = uniqueSlug(title, id);
  getDb()
    .prepare("UPDATE skills SET slug = ?, title = ?, category_id = ?, description = ? WHERE id = ?")
    .run(slug, title, categoryId, description, id);
  return slug;
}

export function setSkillThumbnail(id: number, thumbnail: string) {
  getDb().prepare("UPDATE skills SET thumbnail = ? WHERE id = ?").run(thumbnail, id);
}

export function deleteSkill(id: number) {
  getDb().prepare("DELETE FROM skills WHERE id = ?").run(id);
}

export function addResource(skillId: number, type: ResourceType, title: string, content: string) {
  const db = getDb();
  const max = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS p FROM resources WHERE skill_id = ?")
    .get(skillId) as { p: number };
  db.prepare(
    "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
  ).run(skillId, type, title, content, max.p + 1);
}

export function updateResource(id: number, title: string, content: string) {
  getDb().prepare("UPDATE resources SET title = ?, content = ? WHERE id = ?").run(title, content, id);
}

export function deleteResource(id: number) {
  getDb().prepare("DELETE FROM resources WHERE id = ?").run(id);
}

/** Swaps the resource with its neighbour above (-1) or below (+1). */
export function moveResource(id: number, direction: -1 | 1) {
  const resource = getResource(id);
  if (!resource) return;
  reorder(
    listResources(resource.skill_id),
    id,
    direction,
    getDb().prepare("UPDATE resources SET position = ? WHERE id = ?")
  );
}

/* ------------------------------------------------------------------ */
/* Recycle bin                                                         */
/* ------------------------------------------------------------------ */

/** Days a deleted item stays recoverable before it is purged automatically. */
export const TRASH_RETENTION_DAYS = 30;

export type TrashKind = "skill" | "resource" | "thumbnail";

export interface TrashRow {
  id: number;
  kind: TrashKind;
  label: string;
  detail: string;
  /** JSON restore snapshot — shape depends on `kind`. */
  payload: string;
  /** JSON array of `/files/…` paths this item alone keeps alive. */
  files: string;
  deleted_at: string;
}

export interface SkillSnapshot {
  id: number;
  slug: string;
  title: string;
  /** Category and group *names* — a restore re-links by name, or recreates. */
  category: string;
  group: string;
  description: string;
  thumbnail: string;
  created_at: string;
  resources: { type: ResourceType; title: string; content: string; position: number }[];
}

export interface ResourceSnapshot {
  skill_id: number;
  skill_title: string;
  type: ResourceType;
  title: string;
  content: string;
  position: number;
}

export interface ThumbnailSnapshot {
  skill_id: number;
  skill_title: string;
  thumbnail: string;
}

export function listTrash(): TrashRow[] {
  return getDb().prepare("SELECT * FROM trash ORDER BY deleted_at DESC, id DESC").all() as TrashRow[];
}

export function countTrash(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM trash").get() as { n: number }).n;
}

export function getTrashRow(id: number): TrashRow | undefined {
  return getDb().prepare("SELECT * FROM trash WHERE id = ?").get(id) as TrashRow | undefined;
}

export function addTrashRow(
  kind: TrashKind,
  label: string,
  detail: string,
  payload: unknown,
  files: string[]
): number {
  const result = getDb()
    .prepare("INSERT INTO trash (kind, label, detail, payload, files) VALUES (?, ?, ?, ?, ?)")
    .run(kind, label, detail, JSON.stringify(payload), JSON.stringify(files));
  return Number(result.lastInsertRowid);
}

export function deleteTrashRow(id: number) {
  getDb().prepare("DELETE FROM trash WHERE id = ?").run(id);
}

/** Bin entries whose retention window has elapsed. */
export function expiredTrash(): TrashRow[] {
  return getDb()
    .prepare(`SELECT * FROM trash WHERE deleted_at <= datetime('now', ?)`)
    .all(`-${TRASH_RETENTION_DAYS} days`) as TrashRow[];
}

export function trashFiles(row: TrashRow): string[] {
  try {
    const parsed: unknown = JSON.parse(row.files);
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * True while anything still points at this upload — a live skill thumbnail, a
 * live resource, or another bin entry. Checked before a purge deletes the file
 * from disk, so a snapshot that shares an image with a restored copy is safe.
 */
export function isFileReferenced(publicPath: string, excludeTrashId?: number): boolean {
  const db = getDb();
  const quoted = `%"${likeEscape(publicPath)}"%`;
  return Boolean(
    db.prepare("SELECT 1 FROM skills WHERE thumbnail = ?").get(publicPath) ||
      db
        .prepare(`SELECT 1 FROM resources WHERE content = ? OR content LIKE ? ESCAPE '\\'`)
        .get(publicPath, quoted) ||
      db
        .prepare(`SELECT 1 FROM trash WHERE id <> ? AND files LIKE ? ESCAPE '\\'`)
        .get(excludeTrashId ?? -1, quoted)
  );
}

/**
 * Re-inserts a deleted skill and its resources. Reuses the original row id when
 * it is still free (AUTOINCREMENT never recycles ids, so it normally is), which
 * keeps any separately-binned resources of that skill restorable.
 */
export function restoreSkillSnapshot(snapshot: SkillSnapshot): { id: number; slug: string } {
  const db = getDb();
  const slug = slugAvailable(snapshot.slug) ? snapshot.slug : uniqueSlug(snapshot.title);
  const reuseId = !getSkillById(snapshot.id);
  // The category may have been deleted while the skill sat in the bin.
  const categoryId = findOrCreateCategory(snapshot.category, snapshot.group);

  const restore = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO skills (${reuseId ? "id, " : ""}slug, title, category_id, description, thumbnail, created_at)
         VALUES (${reuseId ? "?, " : ""}?, ?, ?, ?, ?, ?)`
      )
      .run(
        ...(reuseId ? [snapshot.id] : []),
        slug,
        snapshot.title,
        categoryId,
        snapshot.description,
        snapshot.thumbnail,
        snapshot.created_at
      );
    const id = Number(result.lastInsertRowid);
    const insert = db.prepare(
      "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
    );
    for (const r of snapshot.resources) insert.run(id, r.type, r.title, r.content, r.position);
    return id;
  });

  const id = restore();
  if (id !== snapshot.id) repointTrashedResources(snapshot.id, id);
  return { id, slug };
}

/** Points binned resources of a skill at its new id, when restore couldn't reuse the old one. */
function repointTrashedResources(oldSkillId: number, newSkillId: number) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM trash WHERE kind IN ('resource', 'thumbnail')").all() as TrashRow[];
  const update = db.prepare("UPDATE trash SET payload = ? WHERE id = ?");
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as { skill_id?: number };
      if (payload.skill_id !== oldSkillId) continue;
      update.run(JSON.stringify({ ...payload, skill_id: newSkillId }), row.id);
    } catch {
      // Unparseable snapshot — leave it for the purge to clear.
    }
  }
}

/** Re-inserts a deleted resource under its original skill, keeping its place in the order. */
export function restoreResourceSnapshot(snapshot: ResourceSnapshot) {
  getDb()
    .prepare(
      "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
    )
    .run(snapshot.skill_id, snapshot.type, snapshot.title, snapshot.content, snapshot.position);
}
