"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaAction } from "@/app/admin/media/actions";
import { ACCEPT_ALL_MEDIA, MAX_UPLOAD_MB } from "@/lib/media-types";

type Upload = { name: string; status: "uploading" | "done" | "failed"; error?: string };

/**
 * Drag files in, or browse for them. Each file is its own request, so a slow
 * one doesn't hold up the rest and the list can report them one by one.
 */
export default function MediaUploadZone({ folderId }: { folderId?: number | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const upload = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;

    setUploads(list.map((file) => ({ name: file.name, status: "uploading" })));
    for (const [i, file] of list.entries()) {
      const result = await uploadOne(file, folderId);
      setUploads((current) =>
        current.map((entry, index) =>
          index === i
            ? result.ok
              ? { ...entry, status: "done" }
              : { ...entry, status: "failed", error: result.error }
            : entry
        )
      );
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-teal-400 bg-teal-50" : "border-stone-300 bg-white"
        }`}
      >
        <p className="text-sm text-stone-600">
          Drag files here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            browse
          </button>
          .
        </p>
        <p className="mt-1 text-xs text-stone-400">
          PNG, JPG, GIF, WebP, AVIF, SVG, PDF or MP4 video, up to {MAX_UPLOAD_MB} MB each.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ALL_MEDIA}
          onChange={(e) => upload(e.target.files)}
          className="hidden"
        />
      </div>

      {uploads.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {uploads.map((upload, i) => (
            <li key={`${upload.name}-${i}`} className="flex items-start gap-2">
              <span
                className={
                  upload.status === "failed"
                    ? "text-red-600"
                    : upload.status === "done"
                      ? "text-teal-700"
                      : "text-stone-400"
                }
              >
                {upload.status === "failed" ? "✕" : upload.status === "done" ? "✓" : "…"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-stone-700">{upload.name}</span>
                {upload.error && <span className="block text-xs text-red-600">{upload.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Uploads one file, turning a failed request into an error row. When the
 * server action itself rejects (the body is over the size limit, or the
 * connection drops), the promise throws instead of returning a result.
 */
async function uploadOne(
  file: File,
  folderId: number | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    const mb = Math.ceil(file.size / (1024 * 1024));
    return { ok: false, error: `This file is ${mb} MB; the limit is ${MAX_UPLOAD_MB} MB.` };
  }

  const data = new FormData();
  data.set("file", file);
  if (folderId) data.set("folderId", String(folderId));
  try {
    return await uploadMediaAction(data);
  } catch {
    return {
      ok: false,
      error: "The upload did not reach the server. Check the connection and file size, then try again.",
    };
  }
}
