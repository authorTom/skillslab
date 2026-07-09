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
  listResources,
  moveResource,
  updateSkill,
  type ResourceType,
} from "@/lib/data";
import { UPLOADS_DIR } from "@/lib/db";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];

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

export async function createSkillAction(formData: FormData) {
  await requireAdmin();
  const title = text(formData, "title");
  if (!title) redirect("/admin/skills/new?error=title");
  const id = createSkill(title, text(formData, "category"), text(formData, "description"));
  revalidateAll();
  redirect(`/admin/skills/${id}`);
}

export async function updateSkillAction(id: number, formData: FormData) {
  await requireAdmin();
  const title = text(formData, "title");
  if (!title) redirect(`/admin/skills/${id}?error=title`);
  updateSkill(id, title, text(formData, "category"), text(formData, "description"));
  revalidateAll();
  redirect(`/admin/skills/${id}?saved=1`);
}

export async function deleteSkillAction(id: number) {
  await requireAdmin();
  for (const resource of listResources(id)) {
    removeStoredFiles(resource.type, resource.content);
  }
  deleteSkill(id);
  revalidateAll();
  redirect("/admin");
}

/* ---------------------------- resources -------------------------- */

export async function addResourceAction(formData: FormData) {
  await requireAdmin();
  const skillId = Number(text(formData, "skillId"));
  const type = text(formData, "type") as ResourceType;
  const back = `/admin/skills/${skillId}`;
  if (!skillId || !["pdf", "image", "storyboard", "video"].includes(type)) redirect(back);

  const title = text(formData, "title") || defaultTitle(type);
  let content = "";

  if (type === "video") {
    const url = text(formData, "url");
    if (!/vimeo\.com\/(?:video\/)?\d+/.test(url)) redirect(`${back}?error=vimeo`);
    content = url;
  } else if (type === "storyboard") {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) redirect(`${back}?error=file`);
    const paths: string[] = [];
    for (const file of files) {
      const saved = await saveUpload(file, IMAGE_EXTENSIONS);
      if (!saved) redirect(`${back}?error=filetype`);
      paths.push(saved);
    }
    content = JSON.stringify(paths);
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) redirect(`${back}?error=file`);
    const saved = await saveUpload(file, type === "pdf" ? [".pdf"] : IMAGE_EXTENSIONS);
    if (!saved) redirect(`${back}?error=filetype`);
    content = saved;
  }

  addResource(skillId, type, title, content);
  revalidateAll();
  redirect(back);
}

export async function deleteResourceAction(id: number) {
  await requireAdmin();
  const resource = getResource(id);
  if (!resource) return;
  removeStoredFiles(resource.type, resource.content);
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

function removeStoredFiles(type: ResourceType, content: string) {
  const publicPaths =
    type === "storyboard"
      ? (() => {
          try {
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? (parsed as string[]) : [];
          } catch {
            return [];
          }
        })()
      : type === "video"
        ? []
        : [content];

  for (const publicPath of publicPaths) {
    if (!publicPath.startsWith("/files/")) continue;
    const resolved = path.resolve(UPLOADS_DIR, publicPath.slice("/files/".length));
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) continue;
    fs.rmSync(resolved, { force: true });
  }
}
