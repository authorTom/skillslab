"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { Resource } from "@/lib/data";
import type { MediaItem } from "@/lib/media";
import MediaField from "./MediaField";
import StoryboardField, { type StoryboardStep } from "./StoryboardField";
import { inputClass, primaryButtonClass } from "./formStyles";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export default function EditResourceForm({
  resource,
  file,
  steps,
  action,
}: {
  resource: Resource;
  /** The library file a PDF or image resource currently points at. */
  file?: MediaItem | null;
  /** The storyboard's steps, already resolved to library files. */
  steps?: StoryboardStep[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {});

  // A save can change what the resource points at, so re-read the server's
  // version rather than leaving the page on a stale one.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-stone-700">
          Title
        </label>
        <input id="title" name="title" defaultValue={resource.title} className={inputClass} />
      </div>

      {resource.type === "video" && (
        <div>
          <label htmlFor="url" className="mb-1.5 block text-sm font-medium text-stone-700">
            Vimeo link
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            defaultValue={resource.content}
            placeholder="https://vimeo.com/…"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-stone-400">
            Private links with a hash (e.g. https://vimeo.com/123456789/abcdef) are supported.
          </p>
        </div>
      )}

      {(resource.type === "pdf" || resource.type === "image" || resource.type === "local_video") && (
        <MediaField
          key={file?.id ?? "none"}
          name="mediaId"
          kind={resource.type === "pdf" ? "pdf" : resource.type === "local_video" ? "video" : "image"}
          initial={file}
          label="File"
          hint="Changing this points the resource at a different library file. The old one stays in the library for anything else that uses it."
        />
      )}

      {resource.type === "storyboard" && (
        <StoryboardField key={steps?.map((s) => s.media.id).join("-")} initial={steps} />
      )}

      <SubmitButton />
    </form>
  );
}
