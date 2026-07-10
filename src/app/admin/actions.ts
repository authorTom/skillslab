"use server";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireAdmin, startSession } from "@/lib/auth";
import {
  addResource,
  createSkill,
  deleteResource,
  deleteSkill,
  getResource,
  getSkillById,
  listResources,
  moveResource,
  setSkillThumbnail,
  updateSkill,
  type ResourceType,
} from "@/lib/data";
import { parseStoryboardFrames, type StoryboardFrame } from "@/lib/storyboard";
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

  const id = createSkill(title, text(formData, "category"), text(formData, "description"));
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

  const file = uploadedFile(formData, "thumbnail");
  if (file) {
    const saved = await saveUpload(file, IMAGE_EXTENSIONS);
    if (!saved) return { error: "The thumbnail must be an image (PNG, JPG, GIF, WebP, AVIF or SVG)." };
    removePublicFile(skill.thumbnail);
    setSkillThumbnail(id, saved);
  } else if (formData.get("removeThumbnail")) {
    removePublicFile(skill.thumbnail);
    setSkillThumbnail(id, "");
  }

  updateSkill(id, title, text(formData, "category"), text(formData, "description"));
  revalidateAll();
  return { success: "Changes saved." };
}

export async function deleteSkillAction(id: number) {
  await requireAdmin();
  const skill = getSkillById(id);
  for (const resource of listResources(id)) {
    removeResourceFiles(resource.type, resource.content);
  }
  if (skill) removePublicFile(skill.thumbnail);
  deleteSkill(id);
  revalidateAll();
  redirect("/admin");
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
    if (!/vimeo\.com\/(?:video\/)?\d+/.test(url)) {
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

export async function deleteResourceAction(id: number) {
  await requireAdmin();
  const resource = getResource(id);
  if (!resource) return;
  removeResourceFiles(resource.type, resource.content);
  deleteResource(id);
  revalidateAll();
  redirect(`/admin/skills/${resource.skill_id}`);
}

export async function moveResourceAction(id: number, direction: -1 | 1) {
  await requireAdmin();
  moveResource(id, direction);
  revalidateAll();
}

/* ----------------------------- helpers --------------------------- */

function defaultTitle(type: ResourceType): string {
  return { video: "Video", pdf: "Document", image: "Image", storyboard: "Storyboard" }[type];
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

function removeResourceFiles(type: ResourceType, content: string) {
  const publicPaths =
    type === "storyboard"
      ? parseStoryboardFrames(content).map((frame) => frame.src)
      : type === "video"
        ? []
        : [content];
  for (const publicPath of publicPaths) removePublicFile(publicPath);
}

function removePublicFile(publicPath: string) {
  if (!publicPath.startsWith("/files/")) return;
  const resolved = path.resolve(UPLOADS_DIR, publicPath.slice("/files/".length));
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return;
  fs.rmSync(resolved, { force: true });
}
