"use server";

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
  type ResourceType,
} from "@/lib/data";
import { getMedia } from "@/lib/media";
import { mediaRef } from "@/lib/media-refs";
import {
  purgeAllTrash,
  purgeExpiredTrash,
  purgeTrashItem,
  restoreTrashItem,
  trashResource,
  trashSkill,
  trashThumbnail,
} from "@/lib/trash";
import { serialiseStoryboardFrames, type StoryboardFrame } from "@/lib/storyboard";
import { NEW_CATEGORY } from "@/lib/taxonomy";

export type ActionState = { error?: string; success?: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

  const thumbnail = chosenMedia(formData, "thumbnailMediaId", "image");
  if ("error" in thumbnail) return thumbnail;

  const category = chosenCategory(formData);
  if ("error" in category) return category;

  const id = createSkill(title, category.categoryId, text(formData, "description"));
  if (thumbnail.mediaId) setSkillThumbnail(id, thumbnail.mediaId);
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

  const thumbnail = chosenMedia(formData, "thumbnailMediaId", "image");
  if ("error" in thumbnail) return thumbnail;

  if (thumbnail.mediaId && thumbnail.mediaId !== skill.thumbnail_media_id) {
    trashThumbnail(skill);
    setSkillThumbnail(id, thumbnail.mediaId);
  } else if (formData.get("removeThumbnail")) {
    trashThumbnail(skill);
    setSkillThumbnail(id, null);
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

  const content = chosenContent(formData, type);
  if ("error" in content) return content;

  addResource(skillId, type, text(formData, "title") || defaultTitle(type), content.content);
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

  const content = chosenContent(formData, resource.type);
  if ("error" in content) return content;

  updateResource(id, text(formData, "title") || defaultTitle(resource.type), content.content);
  revalidateAll();
  return { success: "Changes saved." };
}

/**
 * A resource's content as the form describes it: a Vimeo link, one library
 * file, or the storyboard's steps in the order they were arranged.
 */
function chosenContent(
  formData: FormData,
  type: ResourceType
): { content: string } | { error: string } {
  if (type === "video") {
    const url = text(formData, "url");
    if (!VIMEO_URL.test(url)) {
      return { error: "That link doesn't look like a Vimeo URL (e.g. https://vimeo.com/76979871)." };
    }
    return { content: url };
  }

  if (type === "storyboard") {
    const ids = formData
      .getAll("frameMediaId")
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0);
    const captions = formData
      .getAll("frameCaption")
      .map((value) => (typeof value === "string" ? value.trim() : ""));

    if (ids.length === 0) {
      return { error: "A storyboard needs at least one step — choose an image from the library." };
    }
    const frames: StoryboardFrame[] = [];
    for (const [i, mediaId] of ids.entries()) {
      const media = getMedia(mediaId);
      if (!media || media.kind !== "image") {
        return { error: "One of the storyboard steps is no longer in the media library." };
      }
      frames.push({ media_id: mediaId, caption: captions[i] ?? "" });
    }
    return { content: serialiseStoryboardFrames(frames) };
  }

  const chosen = chosenMedia(formData, "mediaId", type === "pdf" ? "pdf" : "image");
  if ("error" in chosen) return chosen;
  if (!chosen.mediaId) {
    return {
      error:
        type === "pdf"
          ? "Choose a PDF from the media library, or upload one."
          : "Choose an image from the media library, or upload one.",
    };
  }
  return { content: mediaRef(chosen.mediaId) };
}

/** A library file picked on a form, checked for existence and for its kind. */
function chosenMedia(
  formData: FormData,
  key: string,
  kind: "image" | "pdf"
): { mediaId: number | null } | { error: string } {
  const id = Number(text(formData, key));
  if (!Number.isInteger(id) || id <= 0) return { mediaId: null };

  const media = getMedia(id);
  if (!media) return { error: "That file is no longer in the media library." };
  if (media.kind !== kind) {
    return { error: kind === "pdf" ? "That file isn't a PDF." : "That file isn't an image." };
  }
  return { mediaId: id };
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
      ? `/admin/trash?success=${encodeURIComponent("Item deleted permanently and its file removed.")}`
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
