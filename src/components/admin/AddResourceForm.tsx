"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ResourceType } from "@/lib/data";

const TYPES: { value: ResourceType; label: string; hint: string }[] = [
  { value: "video", label: "Vimeo video", hint: "Paste a Vimeo link, e.g. https://vimeo.com/76979871" },
  { value: "pdf", label: "PDF document", hint: "Upload a PDF file" },
  { value: "image", label: "Image", hint: "Upload a PNG, JPG, GIF, WebP, AVIF or SVG image" },
  { value: "storyboard", label: "Storyboard", hint: "Upload multiple images in step order" },
];

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

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
  action: (formData: FormData) => Promise<void>;
}) {
  const [type, setType] = useState<ResourceType>("video");
  const formRef = useRef<HTMLFormElement>(null);
  const selected = TYPES.find((t) => t.value === type)!;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="skillId" value={skillId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="resource-type" className="mb-1.5 block text-sm font-medium text-stone-700">
            Type
          </label>
          <select
            id="resource-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
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
            className="w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
          />
        ) : (
          <input
            key={type}
            name="file"
            type="file"
            required
            accept={type === "pdf" ? "application/pdf" : "image/*,.svg"}
            className="w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
          />
        )}
        <p className="mt-1.5 text-xs text-stone-400">{selected.hint}</p>
      </div>

      <SubmitButton />
    </form>
  );
}
