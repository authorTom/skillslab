import type { MediaKind } from "@/lib/media-types";

export interface Thumbnailable {
  url: string;
  kind: MediaKind;
  filename: string;
  alt: string;
  missing: boolean;
}

/**
 * A file's preview tile: the image itself, or a document mark for a PDF. Used
 * by the library grid, the picker and the forms, so they all read the same.
 */
export default function MediaThumb({
  item,
  className = "aspect-[4/3] w-full",
}: {
  item: Thumbnailable;
  className?: string;
}) {
  if (item.missing) {
    return (
      <div
        className={`flex items-center justify-center bg-stone-100 text-center text-xs text-stone-400 ${className}`}
      >
        File missing
      </div>
    );
  }

  if (item.kind === "pdf") {
    return (
      <div className={`flex items-center justify-center bg-stone-50 ${className}`}>
        <svg
          className="h-10 w-10 text-stone-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.url}
      alt={item.alt || item.filename}
      loading="lazy"
      className={`bg-stone-50 object-contain ${className}`}
    />
  );
}
