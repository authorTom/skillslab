"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/media/actions";
import type { MediaKind } from "@/lib/media-types";
import { ACCEPT_IMAGES, ACCEPT_VIDEO } from "@/lib/media-types";
import { fileInputClass } from "./formStyles";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-60"
    >
      {pending ? "Replacing…" : "Replace file"}
    </button>
  );
}

/** Swaps the file behind a library item, keeping every course pointed at it. */
export default function MediaReplaceForm({
  kind,
  action,
}: {
  kind: MediaKind;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}
      <input
        name="file"
        type="file"
        required
        accept={kind === "pdf" ? "application/pdf" : kind === "video" ? ACCEPT_VIDEO : ACCEPT_IMAGES}
        className={fileInputClass}
      />
      <SubmitButton />
    </form>
  );
}
