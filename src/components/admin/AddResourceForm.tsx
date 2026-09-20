"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { ResourceType } from "@/lib/data";
import MediaField from "./MediaField";
import StoryboardField from "./StoryboardField";
import { inputClass, primaryButtonClass } from "./formStyles";

const TYPES: { value: ResourceType; label: string; hint: string }[] = [
  { value: "local_video", label: "Video (local file)", hint: "Pick an MP4 video from the media library, or upload one" },
  { value: "video", label: "Video (Vimeo)", hint: "Paste a Vimeo link, e.g. https://vimeo.com/76979871" },
  { value: "pdf", label: "PDF document", hint: "Pick a PDF from the media library, or upload one" },
  { value: "image", label: "Image", hint: "Pick an image from the media library, or upload one" },
  { value: "storyboard", label: "Storyboard", hint: "Add images in step order, then caption each step" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={primaryButtonClass}>
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
  // Bumped after a successful add so the picked file clears with the form.
  const [fieldKey, setFieldKey] = useState(0);
  const [handledState, setHandledState] = useState(state);
  const formRef = useRef<HTMLFormElement>(null);
  const selected = TYPES.find((t) => t.value === type)!;

  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setFieldKey((key) => key + 1);
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

      {type === "video" ? (
        <div>
          <input
            name="url"
            type="url"
            required
            placeholder="https://vimeo.com/…"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-stone-400">{selected.hint}</p>
        </div>
      ) : type === "storyboard" ? (
        <StoryboardField key={`storyboard-${fieldKey}`} />
      ) : (
        <MediaField
          key={`${type}-${fieldKey}`}
          name="mediaId"
          kind={type === "local_video" ? "video" : type === "pdf" ? "pdf" : "image"}
          label="File"
          hint={selected.hint}
        />
      )}

      <SubmitButton />
    </form>
  );
}
