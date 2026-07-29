"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { MediaItem } from "@/lib/media";
import MediaField from "./MediaField";
import SkillFields, { type CategoryOption, type SkillDefaults } from "./SkillFields";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function SkillForm({
  action,
  defaults,
  categories,
  groups,
  thumbnail,
  submitLabel,
  pendingLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: SkillDefaults;
  categories: CategoryOption[];
  groups: { id: number; name: string }[];
  thumbnail?: MediaItem | null;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}

      <SkillFields defaults={defaults} categories={categories} groups={groups} />

      <MediaField
        name="thumbnailMediaId"
        kind="image"
        initial={thumbnail}
        removeName="removeThumbnail"
        label="Thumbnail (optional)"
        hint="Shown on the course's card in the catalogue. Several courses can share one image."
      />

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
