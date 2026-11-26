import { Directory, Filesystem } from "@capacitor/filesystem";
import { isOpen, listAllResources, listAllStoryboardFrames, listSkills } from "./catalogue";
import { CONTENT_DIR } from "./assets";
import { KEY_POINT_FIELDS } from "./keyPoints";
import type { Resource, Skill, StoryboardFrame } from "./types";

/**
 * "What's new": the skills a content update added, changed or removed.
 *
 * Worked out on the iPad, by comparing the catalogue being replaced with the
 * one replacing it, so it is right however many releases the iPad skipped.
 * Skills are matched by id, which the CMS keeps stable between releases.
 */

const FILE = `${CONTENT_DIR}/whats-new.json`;
const DISMISSED_KEY = "skillslab_whats_new_dismissed";

export interface ChangedSkill {
  slug: string;
  title: string;
}

export interface CatalogueChanges {
  added: ChangedSkill[];
  updated: ChangedSkill[];
  /** Titles only: there is nothing left to open. */
  removed: string[];
}

export interface WhatsNew extends CatalogueChanges {
  releaseId: string;
  version: string;
  /** The version installed before, when known. */
  fromVersion: string | null;
}

interface SkillPrint {
  slug: string;
  title: string;
  print: string;
}

/** Skill id to a string that changes whenever anything a learner sees in
 *  that skill does. */
export type CatalogueSnapshot = Map<number, SkillPrint>;

/**
 * Fingerprints each skill from the fields learners see. Fields a release
 * doesn't have yet read as empty, so installing the first release that has
 * them doesn't mark every skill as changed.
 */
export function fingerprintCatalogue(
  skills: Skill[],
  resources: Resource[],
  frames: StoryboardFrame[]
): CatalogueSnapshot {
  const framesByResource = new Map<number, StoryboardFrame[]>();
  for (const f of frames) {
    const list = framesByResource.get(f.resource_id) ?? [];
    list.push(f);
    framesByResource.set(f.resource_id, list);
  }
  const resourcesBySkill = new Map<number, Resource[]>();
  for (const r of resources) {
    const list = resourcesBySkill.get(r.skill_id) ?? [];
    list.push(r);
    resourcesBySkill.set(r.skill_id, list);
  }

  const snapshot: CatalogueSnapshot = new Map();
  for (const s of skills) {
    const skillResources = [...(resourcesBySkill.get(s.id) ?? [])].sort((a, b) => a.position - b.position || a.id - b.id);
    const print = JSON.stringify([
      s.title,
      s.description,
      s.category_id,
      s.thumbnail_asset,
      KEY_POINT_FIELDS.map((f) => s[f.key] ?? ""),
      skillResources.map((r) => [
        r.type,
        r.title,
        r.content,
        r.asset,
        r.chapters && r.chapters !== "[]" ? r.chapters : "",
        [...(framesByResource.get(r.id) ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((f) => [f.asset, f.caption]),
      ]),
    ]);
    snapshot.set(s.id, { slug: s.slug, title: s.title, print });
  }
  return snapshot;
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

export function diffCatalogues(before: CatalogueSnapshot, after: CatalogueSnapshot): CatalogueChanges {
  const added: ChangedSkill[] = [];
  const updated: ChangedSkill[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) added.push({ slug: now.slug, title: now.title });
    else if (was.print !== now.print) updated.push({ slug: now.slug, title: now.title });
  }
  const removed = [...before]
    .filter(([id]) => !after.has(id))
    .map(([, was]) => was.title)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return { added: added.sort(byTitle), updated: updated.sort(byTitle), removed };
}

export function hasChanges(changes: CatalogueChanges): boolean {
  return changes.added.length + changes.updated.length + changes.removed.length > 0;
}

/** The open catalogue's fingerprints, or null when none is open. */
export async function snapshotCatalogue(): Promise<CatalogueSnapshot | null> {
  if (!isOpen()) return null;
  const [skills, resources, frames] = await Promise.all([listSkills(), listAllResources(), listAllStoryboardFrames()]);
  return fingerprintCatalogue(skills, resources, frames);
}

/**
 * Records what the release just activated changed, compared with `before`,
 * the snapshot taken of the release it replaced. With no `before` (a first
 * install, or one that couldn't be read) any older record is dropped instead.
 * Best effort: it never fails an install.
 */
export async function recordWhatsNew(
  before: CatalogueSnapshot | null,
  release: { releaseId: string; version: string },
  fromVersion: string | null
): Promise<void> {
  try {
    const after = before ? await snapshotCatalogue() : null;
    if (!before || !after) {
      await clearWhatsNew();
      return;
    }
    const record: WhatsNew = { ...release, fromVersion, ...diffCatalogues(before, after) };
    await Filesystem.writeFile({
      path: FILE,
      directory: Directory.Documents,
      data: JSON.stringify(record),
      encoding: "utf8" as never,
      recursive: true,
    });
  } catch {
    // Only a convenience; the content is installed either way.
  }
}

export async function clearWhatsNew(): Promise<void> {
  await Filesystem.deleteFile({ path: FILE, directory: Directory.Documents }).catch(() => {});
}

/** What the installed release changed, if it's known and anything did. */
export async function readWhatsNew(releaseId: string): Promise<WhatsNew | null> {
  try {
    const result = await Filesystem.readFile({ path: FILE, directory: Directory.Documents, encoding: "utf8" as never });
    const record = JSON.parse(result.data as string) as WhatsNew;
    if (record.releaseId !== releaseId) return null;
    return hasChanges(record) ? record : null;
  } catch {
    return null;
  }
}

export function isWhatsNewDismissed(releaseId: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === releaseId;
  } catch {
    return false;
  }
}

export function dismissWhatsNew(releaseId: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, releaseId);
  } catch {
    // Storage unavailable: it shows again next time, which is harmless.
  }
}

/** Shows a dismissed summary again. */
export function undismissWhatsNew(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing to do.
  }
}
