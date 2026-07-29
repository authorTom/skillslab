"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkMediaAction } from "@/app/admin/media/actions";
import { formatBytes } from "@/lib/files";
import type { MediaItem } from "@/lib/media";
import type { MediaFolder } from "@/lib/media";
import MediaThumb from "./MediaThumb";
import { inputClass } from "./formStyles";

/**
 * The library itself. Cards open the file's detail page; the checkboxes drive
 * the bulk bar, which posts the whole selection to one action.
 */
export default function MediaGrid({
  items,
  folders,
  usage,
}: {
  items: MediaItem[];
  folders: MediaFolder[];
  /** How many places each file is used, keyed by media id. */
  usage: Record<number, number>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const allSelected = items.length > 0 && selected.length === items.length;

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    );

  return (
    <form action={bulkMediaAction}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : items.map((item) => item.id))}
            className="accent-teal-600"
          />
          Select all
        </label>
        <span className="text-sm text-stone-400">
          {selected.length > 0
            ? `${selected.length} selected`
            : `${items.length} ${items.length === 1 ? "file" : "files"}`}
        </span>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="folderId"
              defaultValue=""
              aria-label="Folder to move the selection to"
              className={`${inputClass} w-auto py-1.5`}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <button
              name="bulkAction"
              value="move"
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
            >
              Move
            </button>
            <input
              name="tag"
              placeholder="Tag name"
              aria-label="Tag to add to the selection"
              className={`${inputClass} w-32 py-1.5`}
            />
            <button
              name="bulkAction"
              value="tag"
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
            >
              Add tag
            </button>
            <button
              name="bulkAction"
              value="delete"
              onClick={(e) => {
                if (
                  !confirm(
                    `Move ${selected.length} file(s) to the recycle bin? Files still used by a course are kept.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">No files here</p>
          <p className="mt-1 text-sm text-stone-400">
            Upload something, or clear the filters to see the whole library.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const used = usage[item.id] ?? 0;
            return (
              <li
                key={item.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                  selected.includes(item.id) ? "border-teal-500 ring-2 ring-teal-100" : "border-stone-200"
                }`}
              >
                <div className="relative">
                  <Link href={`/admin/media/${item.id}`} className="block">
                    <MediaThumb item={item} className="aspect-[4/3] w-full object-contain" />
                  </Link>
                  <label className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm">
                    <input
                      type="checkbox"
                      name="selected"
                      value={item.id}
                      checked={selected.includes(item.id)}
                      onChange={() => toggle(item.id)}
                      aria-label={`Select ${item.filename}`}
                      className="accent-teal-600"
                    />
                  </label>
                </div>
                <div className="border-t border-stone-100 px-3 py-2.5">
                  <Link
                    href={`/admin/media/${item.id}`}
                    className="block truncate text-sm font-medium text-stone-800 hover:text-teal-700"
                  >
                    {item.title || item.filename}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-stone-400">
                    {formatBytes(item.bytes)}
                    {item.width && item.height ? ` · ${item.width} × ${item.height}` : ""}
                    {used > 0 && ` · used ${used}×`}
                  </p>
                  {item.tags.length > 0 && (
                    <p className="mt-1 truncate text-xs text-stone-400">{item.tags.join(", ")}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
