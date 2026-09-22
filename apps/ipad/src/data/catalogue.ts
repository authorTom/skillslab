import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { Category, Group, MediaItem, Resource, Skill, StoryboardFrame } from "./types";

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;

const CATALOGUE_DB = "catalogue";

export async function openCatalogue(dbPath?: string): Promise<boolean> {
  try {
    const exists = await sqlite.isDatabase(CATALOGUE_DB);
    if (!exists.result) return false;
    db = await sqlite.createConnection(CATALOGUE_DB, false, "no-encryption", 1, true);
    await db.open();
    return true;
  } catch {
    db = null;
    return false;
  }
}

export async function closeCatalogue(): Promise<void> {
  if (!db) return;
  await db.close();
  await sqlite.closeConnection(CATALOGUE_DB, true);
  db = null;
}

export function isOpen(): boolean {
  return db !== null;
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!db) return [];
  const result = await db.query(sql, params);
  return (result.values ?? []) as T[];
}

export async function getMetadata(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>("SELECT value FROM metadata WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function listGroups(): Promise<Group[]> {
  return query("SELECT * FROM groups ORDER BY position, name COLLATE NOCASE");
}

export async function listCategories(): Promise<Category[]> {
  return query("SELECT * FROM categories ORDER BY (group_id IS NULL), group_id, position, name COLLATE NOCASE");
}

export async function listSkills(): Promise<Skill[]> {
  return query("SELECT * FROM skills ORDER BY title COLLATE NOCASE");
}

export async function getSkill(id: number): Promise<Skill | null> {
  const rows = await query<Skill>("SELECT * FROM skills WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getCategory(id: number): Promise<Category | null> {
  const rows = await query<Category>("SELECT * FROM categories WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getSkillBySlug(slug: string): Promise<Skill | null> {
  const rows = await query<Skill>("SELECT * FROM skills WHERE slug = ?", [slug]);
  return rows[0] ?? null;
}

export async function listResources(skillId: number): Promise<Resource[]> {
  return query("SELECT * FROM resources WHERE skill_id = ? ORDER BY position, id", [skillId]);
}

export async function listStoryboardFrames(resourceId: number): Promise<StoryboardFrame[]> {
  return query("SELECT * FROM storyboard_frames WHERE resource_id = ? ORDER BY position", [resourceId]);
}

export async function getMedia(id: number): Promise<MediaItem | null> {
  const rows = await query<MediaItem>("SELECT * FROM media WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function searchSkills(term: string): Promise<Skill[]> {
  const like = `%${term}%`;
  return query(
    `SELECT s.* FROM skills s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.title LIKE ? OR s.description LIKE ? OR c.name LIKE ?
     ORDER BY s.title COLLATE NOCASE`,
    [like, like, like]
  );
}

export async function getContentSchemaVersion(): Promise<number> {
  const v = await getMetadata("content_schema_version");
  return v ? Number(v) : 0;
}

export async function getReleaseInfo(): Promise<{
  id: string;
  version: string;
  createdAt: string;
} | null> {
  const id = await getMetadata("release_id");
  const version = await getMetadata("release_version");
  const createdAt = await getMetadata("created_at");
  if (!id || !version) return null;
  return { id, version, createdAt: createdAt ?? "" };
}
