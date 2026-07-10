"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import SkillFields from "./SkillFields";

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
  currentThumbnail,
  submitLabel,
  pendingLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: { title: string; category: string; description: string };
  currentThumbnail?: string;
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

      <SkillFields defaults={defaults} />

      <div>
        <label htmlFor="thumbnail" className="mb-1.5 block text-sm font-medium text-stone-700">
          Thumbnail <span className="font-normal text-stone-400">(optional)</span>
        </label>
        {currentThumbnail && (
          <div className="mb-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentThumbnail}
              alt="Current thumbnail"
              className="aspect-video w-40 rounded-lg border border-stone-200 object-cover"
            />
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" name="removeThumbnail" value="1" className="accent-teal-600" />
              Remove thumbnail
            </label>
          </div>
        )}
        <input
          id="thumbnail"
          name="thumbnail"
          type="file"
          accept="image/*,.svg"
          className="w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
        />
        <p className="mt-1.5 text-xs text-stone-400">
          Shown on the skill&apos;s card in the catalogue.
          {currentThumbnail && " Uploading a new image replaces the current one."}
        </p>
      </div>

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
