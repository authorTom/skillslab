"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReleaseActionState } from "./actions";
import { inputClass, primaryButtonClass } from "@/components/admin/formStyles";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={primaryButtonClass}>
      {pending ? "Building…" : "Build release"}
    </button>
  );
}

export default function BuildReleaseForm({
  action,
}: {
  action: (prev: ReleaseActionState, formData: FormData) => Promise<ReleaseActionState>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="version" className="mb-1.5 block text-sm font-medium text-stone-700">
            Version label
          </label>
          <input
            id="version"
            name="version"
            required
            placeholder="e.g. 1.0.0"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vimeoPolicy" className="mb-1.5 block text-sm font-medium text-stone-700">
            Vimeo content
          </label>
          <select id="vimeoPolicy" name="vimeoPolicy" className={inputClass}>
            <option value="strict">Strict (block Vimeo-only resources)</option>
            <option value="permissive">Permissive (include, flagged as online-only)</option>
          </select>
        </div>

        <SubmitButton />
      </div>
    </form>
  );
}
