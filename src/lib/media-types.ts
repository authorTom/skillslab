// What the media library accepts and how it is served. No imports, so the
// serve route, the database layer and client components can all share it.

export type MediaKind = "image" | "pdf" | "video";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];
export const VIDEO_EXTENSIONS = [".mp4"];
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ".pdf", ...VIDEO_EXTENSIONS];

export const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

/** The library kind an extension belongs to, or null if it isn't accepted. */
export function mediaKindFor(ext: string): MediaKind | null {
  if (ext === ".pdf") return "pdf";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return IMAGE_EXTENSIONS.includes(ext) ? "image" : null;
}

/** `accept` attribute for a file input, per kind of upload. */
export const ACCEPT_IMAGES = "image/*,.svg";
export const ACCEPT_MEDIA = "image/*,.svg,application/pdf";
export const ACCEPT_VIDEO = "video/mp4,.mp4";
export const ACCEPT_ALL_MEDIA = "image/*,.svg,application/pdf,video/mp4,.mp4";

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  image: "Image",
  pdf: "PDF",
  video: "Video",
};
