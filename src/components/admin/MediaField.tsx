"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/media";
import type { MediaKind } from "@/lib/media-types";
import { formatBytes } from "@/lib/files";
import MediaPicker from "./MediaPicker";
import MediaThumb from "./MediaThumb";

/**
 * One library file attached to a form — a course thumbnail, a resource's PDF
 * or image. Posts the chosen file's id, so swapping it is a reference change
 * and the file itself stays in the library for anything else that uses it.
 */
export default function MediaField({
  name,
  kind,
  initial,
  label,
  hint,
  removeName,
}: {
  name: string;
  kind: MediaKind;
  initial?: MediaItem | null;
  label: string;
  hint?: string;
  /** When given, a "Remove" checkbox posts under this name instead of a file. */
  removeName?: string;
}) {
  const [selected, setSelected] = useState<MediaItem | null>(initial ?? null);
  const [removed, setRemoved] = useState(false);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>

      {selected && !removed && (
        <div className="mb-3 flex items-center gap-4">
          <MediaThumb
            item={selected}
            className="aspect-video w-40 shrink-0 rounded-lg border border-stone-200 object-contain"
          />
          <div className="min-w-0 text-sm">
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800"
            >
              {selected.filename}
            </a>
            <p className="mt-0.5 text-xs text-stone-400">
              {formatBytes(selected.bytes)}
              {selected.width && selected.height ? ` · ${selected.width} × ${selected.height}` : ""}
              {selected.missing && " · file missing"}
            </p>
          </div>
        </div>
      )}

      {!removed && selected && <input type="hidden" name={name} value={selected.id} />}
      {removed && removeName && <input type="hidden" name={removeName} value="1" />}

      <div className="flex flex-wrap items-center gap-2">
        <MediaPicker
          kind={kind}
          label={selected && !removed ? "Change file" : "Choose from library"}
          onPick={(items) => {
            if (items[0]) {
              setSelected(items[0]);
              setRemoved(false);
            }
          }}
        />
        {removeName && selected && !removed && (
          <button
            type="button"
            onClick={() => setRemoved(true)}
            className="rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
          >
            Remove
          </button>
        )}
        {removed && (
          <span className="text-sm text-stone-500">
            Will be removed on save.{" "}
            <button
              type="button"
              onClick={() => setRemoved(false)}
              className="underline underline-offset-2 hover:text-stone-700"
            >
              Undo
            </button>
          </span>
        )}
      </div>

      {hint && <p className="mt-1.5 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
