import { getDb } from "./db";

export type ResourceType = "pdf" | "image" | "storyboard" | "video";

export interface Skill {
  id: number;
  slug: string;
  title: string;
  category: string;
  description: string;
  thumbnail: string;
  created_at: string;
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

export function listSkills(q?: string, category?: string): SkillWithCount[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: string[] = [];
  if (q) {
    clauses.push("(s.title LIKE ? OR s.description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    clauses.push("s.category = ?");
    params.push(category);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT s.*, COUNT(r.id) AS resource_count
       FROM skills s LEFT JOIN resources r ON r.skill_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.title COLLATE NOCASE`
    )
    .all(...params) as SkillWithCount[];
}

export function listCategories(): string[] {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT category FROM skills WHERE category <> '' ORDER BY category COLLATE NOCASE"
    )
    .all() as { category: string }[];
  return rows.map((r) => r.category);
}

export function getSkillBySlug(slug: string): Skill | undefined {
  return getDb().prepare("SELECT * FROM skills WHERE slug = ?").get(slug) as Skill | undefined;
}

export function getSkillById(id: number): Skill | undefined {
  return getDb().prepare("SELECT * FROM skills WHERE id = ?").get(id) as Skill | undefined;
}

export function listResources(skillId: number): Resource[] {
  return getDb()
    .prepare("SELECT * FROM resources WHERE skill_id = ? ORDER BY position, id")
    .all(skillId) as Resource[];
}

export function getResource(id: number): Resource | undefined {
  return getDb().prepare("SELECT * FROM resources WHERE id = ?").get(id) as Resource | undefined;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "skill";
}

export function uniqueSlug(title: string, excludeId?: number): string {
  const db = getDb();
  const base = slugify(title);
  let slug = base;
  let n = 2;
  const exists = (s: string) =>
    db.prepare("SELECT id FROM skills WHERE slug = ? AND id <> ?").get(s, excludeId ?? -1);
  while (exists(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function createSkill(title: string, category: string, description: string): number {
  const slug = uniqueSlug(title);
  const result = getDb()
    .prepare("INSERT INTO skills (slug, title, category, description) VALUES (?, ?, ?, ?)")
    .run(slug, title, category, description);
  return Number(result.lastInsertRowid);
}

export function updateSkill(id: number, title: string, category: string, description: string) {
  const slug = uniqueSlug(title, id);
  getDb()
    .prepare("UPDATE skills SET slug = ?, title = ?, category = ?, description = ? WHERE id = ?")
    .run(slug, title, category, description, id);
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

export function deleteResource(id: number) {
  getDb().prepare("DELETE FROM resources WHERE id = ?").run(id);
}

/** Swaps the resource with its neighbour above (-1) or below (+1). */
export function moveResource(id: number, direction: -1 | 1) {
  const db = getDb();
  const resource = getResource(id);
  if (!resource) return;
  const siblings = listResources(resource.skill_id);
  const index = siblings.findIndex((r) => r.id === id);
  const target = siblings[index + direction];
  if (!target) return;
  const update = db.prepare("UPDATE resources SET position = ? WHERE id = ?");
  // Normalise positions while swapping, so legacy ties can't stick together.
  const swap = db.transaction(() => {
    siblings.forEach((r, i) => update.run(i, r.id));
    update.run(index + direction, resource.id);
    update.run(index, target.id);
  });
  swap();
}
