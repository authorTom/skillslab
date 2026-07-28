"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { Resource } from "@/lib/data";
import { parseStoryboardFrames, type StoryboardFrame } from "@/lib/storyboard";
import { fileInputClass, inputClass, primaryButtonClass } from "./formStyles";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function fileName(publicPath: string): string {
  return publicPath.split("/").pop() || publicPath;
}

export default function EditResourceForm({
  resource,
  action,
}: {
  resource: Resource;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {});
  const [frames, setFrames] = useState<StoryboardFrame[]>(() =>
    parseStoryboardFrames(resource.content)
  );
  const [newFiles, setNewFiles] = useState<string[]>([]);
  // Bumping this remounts the file inputs, which is how they get cleared.
  const [uploadKey, setUploadKey] = useState(0);
  const [syncedContent, setSyncedContent] = useState(resource.content);
  const [handledState, setHandledState] = useState(state);

  // A save replaces the server content (new uploads get new paths), so reset the
  // frame editor from the refreshed props rather than keeping stale state.
  if (resource.content !== syncedContent) {
    setSyncedContent(resource.content);
    setFrames(parseStoryboardFrames(resource.content));
    setNewFiles([]);
  }

  // Clear the file pickers once a save succeeds; errors keep the choice intact.
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setUploadKey((k) => k + 1);
      setNewFiles([]);
    }
  }

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  const moveFrame = (index: number, direction: -1 | 1) =>
    setFrames((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const setCaption = (index: number, caption: string) =>
    setFrames((current) => current.map((f, i) => (i === index ? { ...f, caption } : f)));

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

      {(resource.type === "pdf" || resource.type === "image") && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Current file</span>
          <div className="mb-3 flex items-center gap-4">
            {resource.type === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resource.content}
                alt=""
                className="aspect-video w-40 rounded-lg border border-stone-200 object-cover"
              />
            ) : null}
            <a
              href={resource.content}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm text-teal-700 underline underline-offset-2 hover:text-teal-800"
            >
              {fileName(resource.content)}
            </a>
          </div>
          <label htmlFor="file" className="mb-1.5 block text-sm font-medium text-stone-700">
            Replace file <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            key={uploadKey}
            id="file"
            name="file"
            type="file"
            accept={resource.type === "pdf" ? "application/pdf" : "image/*,.svg"}
            className={fileInputClass}
          />
          <p className="mt-1.5 text-xs text-stone-400">
            Leave empty to keep the current file. Replacing it moves the old version to the recycle
            bin.
          </p>
        </div>
      )}

      {resource.type === "storyboard" && (
        <div className="space-y-4">
          <div>
            <span className="block text-sm font-medium text-stone-700">Steps</span>
            <p className="mt-1 text-xs text-stone-400">
              Edit captions, reorder with the arrows, or remove a step. Removed images go to the
              recycle bin.
            </p>
          </div>

          {frames.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
              All steps removed — add at least one image below before saving.
            </p>
          ) : (
            <ol className="space-y-3">
              {frames.map((frame, i) => (
                <li
                  key={frame.src}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3 sm:flex-nowrap"
                >
                  <input type="hidden" name="frameSrc" value={frame.src} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frame.src}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg border border-stone-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-stone-400">
                      Step {i + 1}
                    </span>
                    <input
                      name="frameCaption"
                      value={frame.caption}
                      onChange={(e) => setCaption(i, e.target.value)}
                      placeholder="Caption for this step"
                      className={`${inputClass} py-2`}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveFrame(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move step ${i + 1} up`}
                      className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFrame(i, 1)}
                      disabled={i === frames.length - 1}
                      aria-label={`Move step ${i + 1} down`}
                      className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrames((c) => c.filter((_, index) => index !== i))}
                      className="rounded-lg px-2.5 py-1 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div>
            <label htmlFor="files" className="mb-1.5 block text-sm font-medium text-stone-700">
              Add more steps <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              key={uploadKey}
              id="files"
              name="files"
              type="file"
              multiple
              accept="image/*,.svg"
              onChange={(e) => setNewFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
              className={fileInputClass}
            />
            <p className="mt-1.5 text-xs text-stone-400">New images are appended after the steps above.</p>
          </div>

          {newFiles.length > 0 && (
            <ol className="space-y-2 rounded-xl border border-stone-200 p-4">
              {newFiles.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-medium text-stone-400">
                    Step {frames.length + i + 1}
                  </span>
                  <input
                    name="newCaptions"
                    placeholder={`Caption for ${name}`}
                    className={`${inputClass} py-2`}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
