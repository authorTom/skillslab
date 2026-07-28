"use server";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireAdmin, startSession } from "@/lib/auth";
import {
  addResource,
  countSkillsInCategory,
  createCategory,
  createGroup,
  createSkill,
  deleteCategory,
  deleteGroup,
  getCategory,
  getGroup,
  getResource,
  getSkillById,
  moveCategory,
  moveGroup,
  moveResource,
  setSkillThumbnail,
  updateCategory,
  updateGroup,
  updateResource,
  updateSkill,
  type Resource,
  type ResourceType,
} from "@/lib/data";
import {
  purgeAllTrash,
  purgeExpiredTrash,
  purgeTrashItem,
  restoreTrashItem,
  trashResource,
  trashResourceVersion,
  trashSkill,
  trashThumbnail,
} from "@/lib/trash";
import { resourceFilePaths } from "@/lib/files";
import { parseStoryboardFrames, type StoryboardFrame } from "@/lib/storyboard";
import { NEW_CATEGORY } from "@/lib/taxonomy";
import { UPLOADS_DIR } from "@/lib/db";

export type ActionState = { error?: string; success?: string };

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function uploadedFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 && value.name ? value : null;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/* ----------------------------- auth ------------------------------ */

export async function loginAction(formData: FormData) {
  const ok = await startSession(text(formData, "password"));
  if (!ok) redirect("/admin/login?error=1");
  redirect("/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

/* ----------------------------- skills ---------------------------- */

export async function createSkillAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const title = text(formData, "title");
  if (!title) return { error: "A title is required." };

  let thumbnail = "";
  const file = uploadedFile(formData, "thumbnail");
  if (file) {
    const saved = await saveUpload(file, IMAGE_EXTENSIONS);
    if (!saved) return { error: "The thumbnail must be an image (PNG, JPG, GIF, WebP, AVIF or SVG)." };
    thumbnail = saved;
  }

  const category = chosenCategory(formData);
  if ("error" in category) return category;

  const id = createSkill(title, category.categoryId, text(formData, "description"));
  if (thumbnail) setSkillThumbnail(id, thumbnail);
  revalidateAll();
  redirect(`/admin/skills/${id}?created=1`);
}

export async function updateSkillAction(
  id: number,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const skill = getSkillById(id);
  if (!skill) return { error: "This skill no longer exists." };
  const title = text(formData, "title");
  if (!title) return { error: "A title is required." };

  const category = chosenCategory(formData);
  if ("error" in category) return category;

  const file = uploadedFile(formData, "thumbnail");
  if (file) {
    const saved = await saveUpload(file, IMAGE_EXTENSIONS);
    if (!saved) return { error: "The thumbnail must be an image (PNG, JPG, GIF, WebP, AVIF or SVG)." };
    trashThumbnail(skill);
    setSkillThumbnail(id, saved);
  } else if (formData.get("removeThumbnail")) {
    trashThumbnail(skill);
    setSkillThumbnail(id, "");
  }

  updateSkill(id, title, category.categoryId, text(formData, "description"));
  revalidateAll();
  return { success: "Changes saved." };
}

/**
 * The category picked on the course form: an existing one, none, or a new one
 * created on the spot from the "New category…" fields.
 */
function chosenCategory(formData: FormData): { categoryId: number | null } | { error: string } {
  const choice = text(formData, "categoryId");

  if (choice === NEW_CATEGORY) {
    const name = text(formData, "newCategory");
    if (!name) return { error: "Give the new category a name, or pick an existing one." };
    const groupId = Number(text(formData, "newCategoryGroupId"));
    const group = Number.isInteger(groupId) && groupId > 0 ? getGroup(groupId) : undefined;
    return { categoryId: createCategory(name, group?.id ?? null, "") };
  }

  const id = Number(choice);
  return { categoryId: Number.isInteger(id) && id > 0 && getCategory(id) ? id : null };
}

export async function deleteSkillAction(id: number) {
  await requireAdmin();
  const skill = getSkillById(id);
  if (skill) trashSkill(skill);
  revalidateAll();
  redirect("/admin");
}

/* --------------------- groups & categories ----------------------- */

/** Sends the admin back to the taxonomy page with a message. */
function backToCategories(message: { success: string } | { error: string }): never {
  revalidateAll();
  const [key, value] = Object.entries(message)[0];
  redirect(`/admin/categories?${key}=${encodeURIComponent(value)}`);
}

export async function createGroupAction(formData: FormData) {
  await requireAdmin();
  const name = text(formData, "name");
  if (!name) backToCategories({ error: "A group needs a name." });
  createGroup(name, text(formData, "description"));
  backToCategories({ success: `Group “${name}” created.` });
}

export async function updateGroupAction(id: number, formData: FormData) {
  await requireAdmin();
  const group = getGroup(id);
  if (!group) backToCategories({ error: "That group no longer exists." });
  const name = text(formData, "name");
  if (!name) backToCategories({ error: "A group needs a name." });
  updateGroup(id, name, text(formData, "description"));
  backToCategories({ success: `Group “${name}” saved.` });
}

export async function deleteGroupAction(id: number) {
  await requireAdmin();
  const group = getGroup(id);
  if (!group) backToCategories({ error: "That group no longer exists." });
  deleteGroup(id);
  backToCategories({
    success: `Group “${group.name}” deleted. Its categories are now ungrouped.`,
  });
}

export async function moveGroupAction(id: number, direction: -1 | 1) {
  await requireAdmin();
  moveGroup(id, direction);
  revalidateAll();
  redirect("/admin/categories");
}

export async function createCategoryAction(formData: FormData) {
  await requireAdmin();
  const name = text(formData, "name");
  if (!name) backToCategories({ error: "A category needs a name." });
  createCategory(name, groupChoice(formData), text(formData, "description"));
  backToCategories({ success: `Category “${name}” created.` });
}

export async function updateCategoryAction(id: number, formData: FormData) {
  await requireAdmin();
  const category = getCategory(id);
  if (!category) backToCategories({ error: "That category no longer exists." });
  const name = text(formData, "name");
  if (!name) backToCategories({ error: "A category needs a name." });
  updateCategory(id, name, groupChoice(formData), text(formData, "description"));
  backToCategories({ success: `Category “${name}” saved.` });
}

export async function deleteCategoryAction(id: number) {
  await requireAdmin();
  const category = getCategory(id);
  if (!category) backToCategories({ error: "That category no longer exists." });
  const affected = countSkillsInCategory(id);
  deleteCategory(id);
  backToCategories({
    success:
      affected === 0
        ? `Category “${category.name}” deleted.`
        : `Category “${category.name}” deleted. ${affected} ${
            affected === 1 ? "course is" : "courses are"
          } now uncategorised.`,
  });
}

export async function moveCategoryAction(id: number, direction: -1 | 1) {
  await requireAdmin();
  moveCategory(id, direction);
  revalidateAll();
  redirect("/admin/categories");
}

/** The group id from a form's group `<select>`, or null for "no group". */
function groupChoice(formData: FormData): number | null {
  const id = Number(text(formData, "groupId"));
  if (!Number.isInteger(id) || id <= 0) return null;
  return getGroup(id)?.id ?? null;
}

/* ---------------------------- resources -------------------------- */

export async function addResourceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const skillId = Number(text(formData, "skillId"));
  const type = text(formData, "type") as ResourceType;
  if (!skillId || !["pdf", "image", "storyboard", "video"].includes(type)) {
    return { error: "Invalid resource type." };
  }

  const title = text(formData, "title") || defaultTitle(type);
  let content = "";

  if (type === "video") {
    const url = text(formData, "url");
    if (!VIMEO_URL.test(url)) {
      return { error: "That link doesn't look like a Vimeo URL (e.g. https://vimeo.com/76979871)." };
    }
    content = url;
  } else if (type === "storyboard") {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: "Please choose at least one image for the storyboard." };
    const captions = formData.getAll("captions").map((c) => (typeof c === "string" ? c.trim() : ""));
    const frames: StoryboardFrame[] = [];
    for (const [i, file] of files.entries()) {
      const saved = await saveUpload(file, IMAGE_EXTENSIONS);
      if (!saved) {
        return { error: `“${file.name}” isn't a supported image type (PNG, JPG, GIF, WebP, AVIF or SVG).` };
      }
      frames.push({ src: saved, caption: captions[i] ?? "" });
    }
    content = JSON.stringify(frames);
  } else {
    const file = uploadedFile(formData, "file");
    if (!file) return { error: "Please choose a file to upload." };
    const saved = await saveUpload(file, type === "pdf" ? [".pdf"] : IMAGE_EXTENSIONS);
    if (!saved) {
      return {
        error:
          type === "pdf"
            ? "Please upload a PDF file."
            : "That file isn't a supported image type (PNG, JPG, GIF, WebP, AVIF or SVG).",
      };
    }
    content = saved;
  }

  addResource(skillId, type, title, content);
  revalidateAll();
  return { success: "Resource added." };
}

export async function updateResourceAction(
  id: number,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const resource = getResource(id);
  if (!resource) return { error: "This resource no longer exists." };

  const title = text(formData, "title") || defaultTitle(resource.type);
  let content = resource.content;

  if (resource.type === "video") {
    const url = text(formData, "url");
    if (!VIMEO_URL.test(url)) {
      return { error: "That link doesn't look like a Vimeo URL (e.g. https://vimeo.com/76979871)." };
    }
    content = url;
  } else if (resource.type === "storyboard") {
    const result = await editedStoryboard(formData, resource);
    if ("error" in result) return result;
    content = result.content;
  } else {
    // Keeping the current file is the default — an upload replaces it.
    const file = uploadedFile(formData, "file");
    if (file) {
      const saved = await saveUpload(file, resource.type === "pdf" ? [".pdf"] : IMAGE_EXTENSIONS);
      if (!saved) {
        return {
          error:
            resource.type === "pdf"
              ? "Please upload a PDF file."
              : "That file isn't a supported image type (PNG, JPG, GIF, WebP, AVIF or SVG).",
        };
      }
      content = saved;
    }
  }

  const orphaned = orphanedFiles(resource, content);
  trashResourceVersion(resource, orphaned);
  updateResource(id, title, content);
  revalidateAll();
  return {
    success: orphaned.length
      ? "Changes saved. The previous version was moved to the recycle bin."
      : "Changes saved.",
  };
}

export async function deleteResourceAction(id: number) {
  await requireAdmin();
  const resource = getResource(id);
  if (!resource) return;
  trashResource(resource);
  revalidateAll();
  redirect(`/admin/skills/${resource.skill_id}?trashed=1`);
}

export async function moveResourceAction(id: number, direction: -1 | 1) {
  await requireAdmin();
  moveResource(id, direction);
  revalidateAll();
}

/* --------------------------- recycle bin ------------------------- */

export async function restoreTrashAction(id: number) {
  await requireAdmin();
  const result = restoreTrashItem(id);
  revalidateAll();
  redirect(
    result.ok
      ? `/admin/trash?success=${encodeURIComponent(result.message)}`
      : `/admin/trash?error=${encodeURIComponent(result.error)}`
  );
}

export async function purgeTrashAction(id: number) {
  await requireAdmin();
  const purged = purgeTrashItem(id);
  revalidateAll();
  redirect(
    purged
      ? `/admin/trash?success=${encodeURIComponent("Item deleted permanently and its files removed.")}`
      : "/admin/trash"
  );
}

export async function emptyTrashAction() {
  await requireAdmin();
  const count = purgeAllTrash();
  revalidateAll();
  redirect(
    `/admin/trash?success=${encodeURIComponent(
      count === 0
        ? "The recycle bin was already empty."
        : `${count} ${count === 1 ? "item" : "items"} deleted permanently and their files removed.`
    )}`
  );
}

/** Purges anything past its retention window. Called when admin pages load. */
export async function purgeExpiredTrashAction() {
  await requireAdmin();
  return purgeExpiredTrash();
}

/* ----------------------------- helpers --------------------------- */

const VIMEO_URL = /vimeo\.com\/(?:video\/)?\d+/;

function defaultTitle(type: ResourceType): string {
  return { video: "Video", pdf: "Document", image: "Image", storyboard: "Storyboard" }[type];
}

/**
 * Rebuilds storyboard content from an edit: the frames the admin kept (in the
 * order they arranged them, with edited captions) followed by any new uploads.
 */
async function editedStoryboard(
  formData: FormData,
  resource: Resource
): Promise<{ content: string } | { error: string }> {
  const original = parseStoryboardFrames(resource.content);
  const allowed = new Set(original.map((frame) => frame.src));

  const keptSrcs = formData.getAll("frameSrc").map((v) => (typeof v === "string" ? v : ""));
  const keptCaptions = formData.getAll("frameCaption").map((v) => (typeof v === "string" ? v.trim() : ""));
  // Only frames that were already part of this storyboard may be kept, so the
  // form can't be used to point a step at an arbitrary file.
  if (!keptSrcs.every((src) => allowed.has(src))) {
    return { error: "The storyboard steps couldn't be read — please reload the page and try again." };
  }
  const frames: StoryboardFrame[] = keptSrcs.map((src, i) => ({
    src,
    caption: keptCaptions[i] ?? "",
  }));

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const newCaptions = formData.getAll("newCaptions").map((c) => (typeof c === "string" ? c.trim() : ""));
  for (const [i, file] of files.entries()) {
    const saved = await saveUpload(file, IMAGE_EXTENSIONS);
    if (!saved) {
      return { error: `“${file.name}” isn't a supported image type (PNG, JPG, GIF, WebP, AVIF or SVG).` };
    }
    frames.push({ src: saved, caption: newCaptions[i] ?? "" });
  }

  if (frames.length === 0) {
    return { error: "A storyboard needs at least one step — add an image or delete the resource instead." };
  }
  return { content: JSON.stringify(frames) };
}

/** Uploads the pre-edit resource used that the saved version no longer does. */
function orphanedFiles(resource: Resource, newContent: string): string[] {
  const stillUsed = new Set(resourceFilePaths(resource.type, newContent));
  return resourceFilePaths(resource.type, resource.content).filter((p) => !stillUsed.has(p));
}

async function saveUpload(file: File, allowedExtensions: string[]): Promise<string | null> {
  const ext = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.includes(ext)) return null;
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  await fs.promises.writeFile(
    path.join(UPLOADS_DIR, name),
    Buffer.from(await file.arrayBuffer())
  );
  return `/files/${name}`;
}
