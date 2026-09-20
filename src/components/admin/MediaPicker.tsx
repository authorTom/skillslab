"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchMediaAction, uploadMediaAction } from "@/app/admin/media/actions";
import type { MediaItem } from "@/lib/media";
import { ACCEPT_IMAGES, ACCEPT_VIDEO, type MediaKind } from "@/lib/media-types";
import { formatBytes } from "@/lib/files";
import MediaThumb from "./MediaThumb";
import { inputClass } from "./formStyles";

/**
 * Picks files out of the media library, or uploads new ones into it. The same
 * dialog serves resources, storyboards and course thumbnails; the caller says
 * what kind it wants and what to do with the choice.
 */
export default function MediaPicker({
  kind,
  multiple = false,
  onPick,
  label = "Choose from library",
  className,
}: {
  kind: MediaKind;
  multiple?: boolean;
  onPick: (items: MediaItem[]) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300"
        }
      >
        {label}
      </button>
      {open && (
        <PickerDialog
          kind={kind}
          multiple={multiple}
          onClose={() => setOpen(false)}
          onPick={(items) => {
            onPick(items);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PickerDialog({
  kind,
  multiple,
  onPick,
  onClose,
}: {
  kind: MediaKind;
  multiple: boolean;
  onPick: (items: MediaItem[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, startLoading] = useTransition();
  const uploadRef = useRef<HTMLInputElement>(null);

  // Search as you type, with a pause so a fast typist doesn't fire one
  // request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      startLoading(async () => {
        setItems(await searchMediaAction({ q: query || undefined, kind }));
      });
    }, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (item: MediaItem) => {
    if (!multiple) return onPick([item]);
    setSelected((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
    );
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);
    const added: MediaItem[] = [];
    // One request per file: each is its own upload, and a 40 MB batch would
    // otherwise have to fit in a single action call.
    for (const file of Array.from(files)) {
      const data = new FormData();
      data.set("file", file);
      if (kind === "image") data.set("imagesOnly", "1");
      if (kind === "video") data.set("videosOnly", "1");
      const result = await uploadMediaAction(data);
      if (result.ok) added.push(result.media);
      else setError(result.error);
    }
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = "";
    if (added.length === 0) return;

    if (!multiple) return onPick(added.slice(0, 1));
    setItems((current) => [...added, ...current]);
    setSelected((current) => [...current, ...added.map((item) => item.id)]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4"
      role="dialog"
      aria-modal
      aria-label="Media library"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-3">
          <h2 className="text-base font-semibold">Media library</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kind === "pdf" ? "PDFs" : kind === "video" ? "videos" : "images"}…`}
            aria-label="Search the media library"
            className={`${inputClass} ml-auto w-auto min-w-56 flex-1 py-2`}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-stone-500 transition hover:bg-stone-100"
          >
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 bg-stone-50 px-5 py-3">
          <label className="text-sm font-medium text-stone-700">
            Upload new
            <input
              ref={uploadRef}
              type="file"
              multiple={multiple}
              accept={kind === "pdf" ? "application/pdf" : kind === "video" ? ACCEPT_VIDEO : ACCEPT_IMAGES}
              onChange={(e) => upload(e.target.files)}
              className="ml-3 text-sm font-normal text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 file:shadow-sm hover:file:bg-stone-100"
            />
          </label>
          {uploading && <span className="text-sm text-stone-500">Uploading…</span>}
        </div>

        {error && <p className="bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && items.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-400">
              {query
                ? "Nothing matches that search."
                : `No ${kind === "pdf" ? "PDFs" : kind === "video" ? "videos" : "images"} in the library yet — upload one above.`}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      aria-pressed={multiple ? isSelected : undefined}
                      className={`w-full overflow-hidden rounded-xl border-2 text-left transition ${
                        isSelected
                          ? "border-teal-600 ring-2 ring-teal-100"
                          : "border-stone-200 hover:border-teal-300"
                      }`}
                    >
                      <MediaThumb item={item} className="aspect-[4/3] w-full object-contain" />
                      <span className="block border-t border-stone-100 px-2.5 py-2">
                        <span className="block truncate text-xs font-medium text-stone-700">
                          {item.title || item.filename}
                        </span>
                        <span className="block truncate text-xs text-stone-400">
                          {formatBytes(item.bytes)}
                          {item.width && item.height ? ` · ${item.width} × ${item.height}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {multiple && (
          <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-5 py-3">
            <span className="text-sm text-stone-500">
              {selected.length === 0
                ? "Select one or more images"
                : `${selected.length} selected`}
            </span>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() =>
                onPick(
                  selected
                    .map((id) => items.find((item) => item.id === id))
                    .filter((item): item is MediaItem => Boolean(item))
                )
              }
              className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              Add selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
