"use client";

import { useId, useState } from "react";
import { formatTimestamp, parseChapters } from "@/lib/chapters";
import { inputClass } from "./formStyles";

/**
 * The chapter list of an uploaded video: one "time name" pair per line.
 * Learners jump between chapters on the web and the iPad. Checked as it's
 * typed, so a mistake shows before saving.
 */
export default function ChaptersField({ initial = "" }: { initial?: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const parsed = parseChapters(value);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700">
        Chapters (optional)
      </label>
      <textarea
        id={id}
        name="chapters"
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"0:00 Introduction\n0:45 Gather equipment\n1:30 Apply the tourniquet"}
        aria-describedby={`${id}-hint`}
        aria-invalid={!parsed.ok || undefined}
        className={`${inputClass} font-mono`}
      />
      <p id={`${id}-hint`} className={`mt-1.5 text-xs ${parsed.ok ? "text-stone-400" : "text-red-600"}`}>
        {parsed.ok
          ? parsed.chapters.length > 0
            ? `${parsed.chapters.length} ${parsed.chapters.length === 1 ? "chapter" : "chapters"}: ${parsed.chapters
                .map((c) => `${formatTimestamp(c.time)} ${c.title}`)
                .join(" · ")}`
            : "One chapter per line: a time, then its name. Learners can jump straight to each step."
          : parsed.error}
      </p>
    </div>
  );
}
