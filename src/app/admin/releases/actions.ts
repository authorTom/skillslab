"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { buildRelease } from "@/lib/offline/export";
import { signingStatus } from "@/lib/offline/release-signing";
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
  const user = await requireRole("admin");
  const version = (formData.get("version") as string)?.trim();
  if (!version) return { error: "Version is required." };

  const vimeoPolicy = (formData.get("vimeoPolicy") as string) || "strict";
  if (vimeoPolicy !== "strict" && vimeoPolicy !== "permissive") {
    return { error: "Invalid Vimeo policy." };
  }

  let result;
  try {
    result = await buildRelease({
      version,
      vimeoPolicy: vimeoPolicy as VimeoPolicy,
    });
  } catch (error) {
    // A signing key that is configured but unusable stops the build; say why
    // (the message names the file, never the key).
    const status = signingStatus();
    if (status.state === "error") return { error: status.message };
    throw error;
  }

  if (!result.ok) {
    return { error: result.errors.join("\n") };
  }

  markCurrent(result);
  enforceRetention(5);
  recordAudit(user, "release.build", {
    target: version,
    detail: result.manifest.signature ? "signed" : "unsigned",
  });
  revalidatePath("/admin/releases");
  const { counts } = result.manifest;
  return {
    success: `Release ${version} built${result.manifest.signature ? " and signed" : ""}: ${counts.skills} skills, ${counts.resources} resources, ${counts.assets} assets.`,
  };
}

export async function markCurrentAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin");
  const id = formData.get("id") as string;
  if (!id) return;
  markCurrent(id);
  recordAudit(user, "release.mark_current", { target: id });
  revalidatePath("/admin/releases");
}

export async function deleteReleaseAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin");
  const id = formData.get("id") as string;
  if (!id) return;
  if (deleteRelease(id)) recordAudit(user, "release.delete", { target: id });
  revalidatePath("/admin/releases");
}
