"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { ResourceType } from "@/lib/data";

const TYPES: { value: ResourceType; label: string; hint: string }[] = [
  { value: "video", label: "Vimeo video", hint: "Paste a Vimeo link, e.g. https://vimeo.com/76979871" },
  { value: "pdf", label: "PDF document", hint: "Upload a PDF file" },
  { value: "image", label: "Image", hint: "Upload a PNG, JPG, GIF, WebP, AVIF or SVG image" },
  { value: "storyboard", label: "Storyboard", hint: "Upload multiple images in step order, then add a caption for each step" },
];

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

const fileInputClass =
  "w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add resource"}
    </button>
  );
}

export default function AddResourceForm({
  skillId,
  action,
}: {
  skillId: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [type, setType] = useState<ResourceType>("video");
  const [storyboardFiles, setStoryboardFiles] = useState<string[]>([]);
  const [handledState, setHandledState] = useState(state);
  const formRef = useRef<HTMLFormElement>(null);
  const selected = TYPES.find((t) => t.value === type)!;

  // Clear the form after a successful add; validation errors keep the input intact.
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setStoryboardFiles([]);
  }
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="skillId" value={skillId} />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="resource-type" className="mb-1.5 block text-sm font-medium text-stone-700">
            Type
          </label>
          <select
            id="resource-type"
            name="type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ResourceType);
              setStoryboardFiles([]);
            }}
            className={inputClass}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="resource-title" className="mb-1.5 block text-sm font-medium text-stone-700">
            Title
          </label>
          <input
            id="resource-title"
            name="title"
            placeholder={`e.g. ${selected.label}`}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        {type === "video" ? (
          <input
            key="url"
            name="url"
            type="url"
            required
            placeholder="https://vimeo.com/…"
            className={inputClass}
          />
        ) : type === "storyboard" ? (
          <input
            key="files"
            name="files"
            type="file"
            required
            multiple
            accept="image/*,.svg"
            onChange={(e) =>
              setStoryboardFiles(Array.from(e.target.files ?? []).map((f) => f.name))
            }
            className={fileInputClass}
          />
        ) : (
          <input
            key={type}
            name="file"
            type="file"
            required
            accept={type === "pdf" ? "application/pdf" : "image/*,.svg"}
            className={fileInputClass}
          />
        )}
        <p className="mt-1.5 text-xs text-stone-400">{selected.hint}</p>
      </div>

      {type === "storyboard" && storyboardFiles.length > 0 && (
        <ol className="space-y-2 rounded-xl border border-stone-200 p-4">
          {storyboardFiles.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs font-medium text-stone-400">
                Step {i + 1}
              </span>
              <input
                name="captions"
                placeholder={`Caption for ${name}`}
                className={`${inputClass} py-2`}
              />
            </li>
          ))}
        </ol>
      )}

      <SubmitButton />
    </form>
  );
}
