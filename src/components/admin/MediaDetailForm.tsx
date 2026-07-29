"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/media/actions";
import type { MediaFolder, MediaItem } from "@/lib/media";
import { inputClass, primaryButtonClass } from "./formStyles";

function SubmitButton({ label = "Save changes" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function MediaDetailForm({
  media,
  folders,
  action,
}: {
  media: MediaItem;
  folders: MediaFolder[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {});

  // The filename is part of the file's URL, so a rename changes what the rest
  // of the page should be showing.
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
        <label htmlFor="filename" className="mb-1.5 block text-sm font-medium text-stone-700">
          File name
        </label>
        <input
          id="filename"
          name="filename"
          defaultValue={media.filename}
          required
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-stone-400">
          Used for downloads. Every course using this file follows the change — the extension stays
          as it is on disk.
        </p>
      </div>

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-stone-700">
          Title <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <input id="title" name="title" defaultValue={media.title} className={inputClass} />
      </div>

      {media.kind === "image" && (
        <div>
          <label htmlFor="alt" className="mb-1.5 block text-sm font-medium text-stone-700">
            Alt text <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input id="alt" name="alt" defaultValue={media.alt} className={inputClass} />
          <p className="mt-1.5 text-xs text-stone-400">
            Read out by screen readers wherever this image appears.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="folderId" className="mb-1.5 block text-sm font-medium text-stone-700">
            Folder
          </label>
          <select
            id="folderId"
            name="folderId"
            defaultValue={media.folder_id ?? ""}
            className={inputClass}
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tags" className="mb-1.5 block text-sm font-medium text-stone-700">
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={media.tags.join(", ")}
            placeholder="e.g. anatomy, poster"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-stone-400">Separate with commas.</p>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
