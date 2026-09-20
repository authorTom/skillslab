"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  addTagToMedia,
  addUpload,
  createMediaFolder,
  deleteMediaFolder,
  getMedia,
  getMediaFolder,
  listMedia,
  mediaUsage,
  mediaUsageIndex,
  moveMediaToFolder,
  renameMediaFolder,
  replaceMediaFile,
  setMediaTags,
  tagsFor,
  updateMedia,
  usageLabel,
  type MediaFilter,
  type MediaItem,
  type MediaKind,
  type MediaSort,
} from "@/lib/media";
import { IMAGE_EXTENSIONS, MEDIA_EXTENSIONS, VIDEO_EXTENSIONS } from "@/lib/media-types";
import { trashMedia, trashReplacedMedia } from "@/lib/trash";

export type ActionState = { error?: string; success?: string };

/** What the picker and the upload zone get back for a file they just added. */
export type UploadedMedia = { ok: true; media: MediaItem } | { ok: false; error: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/** Sends the admin back to the library with a message. */
function backToMedia(message: { success: string } | { error: string }): never {
  revalidateAll();
  const [key, value] = Object.entries(message)[0];
  redirect(`/admin/media?${key}=${encodeURIComponent(value)}`);
}

/* ----------------------------- uploading -------------------------- */

/**
 * Adds one file to the library. The upload zone calls this once per file so
 * each gets its own progress row and no single request has to carry them all.
 */
export async function uploadMediaAction(formData: FormData): Promise<UploadedMedia> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || !file.name) {
    return { ok: false, error: "No file was received." };
  }

  const imagesOnly = formData.get("imagesOnly") === "1";
  const videosOnly = formData.get("videosOnly") === "1";
  const allowed = imagesOnly ? IMAGE_EXTENSIONS : videosOnly ? VIDEO_EXTENSIONS : MEDIA_EXTENSIONS;
  const folderId = Number(text(formData, "folderId"));
  const result = await addUpload(file, {
    allowed,
    folderId: Number.isInteger(folderId) && folderId > 0 ? folderId : null,
  });

  if (result.ok) revalidateAll();
  return result.ok ? { ok: true, media: result.media } : { ok: false, error: result.error };
}

/* ------------------------- reading, for the picker ---------------- */

/** Backs the picker's search box. Read-only, but admin-only all the same. */
export async function searchMediaAction(filter: {
  q?: string;
  kind?: MediaKind;
  folder?: number | "none";
  tag?: number;
  sort?: MediaSort;
}): Promise<MediaItem[]> {
  await requireAdmin();
  return listMedia({ ...(filter as MediaFilter), limit: 200 });
}

/* ------------------------------ editing --------------------------- */

export async function updateMediaAction(
  id: number,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const media = getMedia(id);
  if (!media) return { error: "That file is no longer in the library." };

  const filename = text(formData, "filename");
  if (!filename) return { error: "A file needs a name." };

  const folderId = Number(text(formData, "folderId"));
  updateMedia(id, {
    filename,
    title: text(formData, "title"),
    alt: text(formData, "alt"),
    folderId: Number.isInteger(folderId) && folderId > 0 && getMediaFolder(folderId) ? folderId : null,
  });
  setMediaTags(
    id,
    text(formData, "tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  revalidateAll();
  return { success: "Changes saved." };
}

export async function replaceMediaAction(
  id: number,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || !file.name) {
    return { error: "Please choose a file to upload." };
  }

  const tags = tagsFor(id);
  const result = await replaceMediaFile(id, file);
  if (!result.ok) return { error: result.error };

  trashReplacedMedia(result.previous, tags);
  revalidateAll();
  return {
    success:
      "File replaced everywhere it is used. The previous version is in the recycle bin.",
  };
}

export async function deleteMediaAction(id: number) {
  await requireAdmin();
  const media = getMedia(id);
  if (!media) backToMedia({ error: "That file is no longer in the library." });

  const usage = mediaUsage(id);
  if (usage.length > 0) {
    backToMedia({
      error: `“${media.filename}” is still used by ${usage.length === 1 ? "" : `${usage.length} places, including `}${usageLabel(usage[0])}. Remove it there first.`,
    });
  }

  trashMedia(media);
  backToMedia({ success: `“${media.filename}” moved to the recycle bin.` });
}

/* ------------------------------- bulk ----------------------------- */

export async function bulkMediaAction(formData: FormData) {
  await requireAdmin();
  const ids = formData
    .getAll("selected")
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) backToMedia({ error: "Nothing was selected." });

  switch (text(formData, "bulkAction")) {
    case "delete":
      return bulkDelete(ids);
    case "move": {
      const choice = Number(text(formData, "folderId"));
      const folderId = Number.isInteger(choice) && choice > 0 ? getMediaFolder(choice)?.id ?? null : null;
      moveMediaToFolder(ids, folderId);
      const folder = folderId ? getMediaFolder(folderId) : null;
      backToMedia({
        success: `${count(ids.length, "file")} moved to ${folder ? `“${folder.name}”` : "no folder"}.`,
      });
      break;
    }
    case "tag": {
      const tag = text(formData, "tag");
      if (!tag) backToMedia({ error: "Type a tag name to add." });
      addTagToMedia(ids, tag);
      backToMedia({ success: `“${tag}” added to ${count(ids.length, "file")}.` });
      break;
    }
    default:
      backToMedia({ error: "Pick what to do with the selected files." });
  }
}

/** Deletes what it can and says plainly which files are still in use. */
function bulkDelete(ids: number[]): never {
  const usage = mediaUsageIndex();
  const blocked: string[] = [];
  let deleted = 0;

  for (const id of ids) {
    const media = getMedia(id);
    if (!media) continue;
    if ((usage.get(id) ?? []).length > 0) {
      blocked.push(media.filename);
      continue;
    }
    trashMedia(media);
    deleted++;
  }

  if (blocked.length === 0) {
    backToMedia({ success: `${count(deleted, "file")} moved to the recycle bin.` });
  }
  const names = blocked.slice(0, 3).join(", ");
  const more = blocked.length > 3 ? ` and ${blocked.length - 3} more` : "";
  if (deleted === 0) {
    backToMedia({ error: `Still in use, so nothing was deleted: ${names}${more}.` });
  }
  backToMedia({
    error: `${count(deleted, "file")} moved to the recycle bin. Still in use: ${names}${more}.`,
  });
}

/* ------------------------------ folders --------------------------- */

export async function createFolderAction(formData: FormData) {
  await requireAdmin();
  const name = text(formData, "name");
  if (!name) backToMedia({ error: "A folder needs a name." });
  createMediaFolder(name);
  backToMedia({ success: `Folder “${name}” created.` });
}

export async function renameFolderAction(id: number, formData: FormData) {
  await requireAdmin();
  if (!getMediaFolder(id)) backToMedia({ error: "That folder no longer exists." });
  const name = text(formData, "name");
  if (!name) backToMedia({ error: "A folder needs a name." });
  renameMediaFolder(id, name);
  backToMedia({ success: `Folder renamed to “${name}”.` });
}

export async function deleteFolderAction(id: number) {
  await requireAdmin();
  const folder = getMediaFolder(id);
  if (!folder) backToMedia({ error: "That folder no longer exists." });
  deleteMediaFolder(id);
  backToMedia({
    success: `Folder “${folder.name}” deleted.${
      folder.media_count > 0
        ? ` Its ${count(folder.media_count, "file")} ${folder.media_count === 1 ? "is" : "are"} now unfiled.`
        : ""
    }`,
  });
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
