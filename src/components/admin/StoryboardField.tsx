"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/media";
import MediaPicker from "./MediaPicker";
import MediaThumb from "./MediaThumb";
import { inputClass } from "./formStyles";

export interface StoryboardStep {
  media: MediaItem;
  caption: string;
}

/**
 * The steps of a storyboard: library images in the order learners see them,
 * each with its caption. Posts one `frameMediaId` and `frameCaption` per step,
 * in order, which is what the action rebuilds the content from.
 */
export default function StoryboardField({ initial = [] }: { initial?: StoryboardStep[] }) {
  const [steps, setSteps] = useState<StoryboardStep[]>(initial);

  const move = (index: number, direction: -1 | 1) =>
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-medium text-stone-700">Steps</span>
        <p className="mt-1 text-xs text-stone-400">
          Choose images from the media library, then caption and order them. Removing a step here
          leaves the image in the library for other courses to use.
        </p>
      </div>

      {steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
          No steps yet — add images below.
        </p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={`${step.media.id}-${i}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3 sm:flex-nowrap"
            >
              <input type="hidden" name="frameMediaId" value={step.media.id} />
              <MediaThumb
                item={step.media}
                className="h-14 w-20 shrink-0 rounded-lg border border-stone-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-stone-400">
                  Step {i + 1} · {step.media.filename}
                </span>
                <input
                  name="frameCaption"
                  value={step.caption}
                  onChange={(e) =>
                    setSteps((current) =>
                      current.map((s, index) =>
                        index === i ? { ...s, caption: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Caption for this step"
                  className={`${inputClass} py-2`}
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move step ${i + 1} up`}
                  className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label={`Move step ${i + 1} down`}
                  className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-stone-100 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setSteps((current) => current.filter((_, index) => index !== i))}
                  className="rounded-lg px-2.5 py-1 text-sm text-red-600 transition hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <MediaPicker
        kind="image"
        multiple
        label="+ Add steps from the library"
        onPick={(items) =>
          setSteps((current) => [...current, ...items.map((media) => ({ media, caption: "" }))])
        }
      />
    </div>
  );
}
