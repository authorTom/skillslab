import type { ResourceType } from "@/lib/data";

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  video: "Video",
  pdf: "PDF",
  image: "Image",
  storyboard: "Storyboard",
};

const PATHS: Record<ResourceType, React.ReactNode> = {
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10.5 9.5 4.5 2.5-4.5 2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  pdf: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 17 4.5-4.5 3 3L15 12l5 5" />
    </>
  ),
  storyboard: (
    <>
      <rect x="3" y="6" width="8" height="12" rx="1.5" />
      <rect x="13" y="6" width="8" height="12" rx="1.5" />
    </>
  ),
};

export function ResourceIcon({
  type,
  className = "h-4 w-4",
}: {
  type: ResourceType;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[type]}
    </svg>
  );
}
