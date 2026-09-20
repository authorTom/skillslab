"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { buildRelease } from "@/lib/offline/export";
import {
  deleteRelease,
  enforceRetention,
  markCurrent,
} from "@/lib/offline/releases";
import type { VimeoPolicy } from "@/lib/offline/schema";

export type ReleaseActionState = { error?: string; success?: string };

export async function buildReleaseAction(
  _prev: ReleaseActionState,
  formData: FormData
): Promise<ReleaseActionState> {
  await requireAdmin();
  const version = (formData.get("version") as string)?.trim();
  if (!version) return { error: "Version is required." };

  const vimeoPolicy = (formData.get("vimeoPolicy") as string) || "strict";
  if (vimeoPolicy !== "strict" && vimeoPolicy !== "permissive") {
    return { error: "Invalid Vimeo policy." };
  }

  const result = await buildRelease({
    version,
    vimeoPolicy: vimeoPolicy as VimeoPolicy,
  });

  if (!result.ok) {
    return { error: result.errors.join("\n") };
  }

  markCurrent(result);
  enforceRetention(5);
  revalidatePath("/admin/releases");
  const { counts } = result.manifest;
  return {
    success: `Release ${version} built: ${counts.skills} skills, ${counts.resources} resources, ${counts.assets} assets.`,
  };
}

export async function markCurrentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  markCurrent(id);
  revalidatePath("/admin/releases");
}

export async function deleteReleaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  deleteRelease(id);
  revalidatePath("/admin/releases");
}
