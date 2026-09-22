import { DocumentIcon, PhotoIcon, PlayIcon, StoryboardIcon } from "./icons";

const LABELS: Record<string, string> = {
  video: "Video (online)",
  local_video: "Video",
  pdf: "PDF",
  image: "Image",
  storyboard: "Storyboard",
};

export function resourceTypeLabel(type: string): string {
  return LABELS[type] ?? type;
}

export default function ResourceIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? "h-4 w-4";

  switch (type) {
    case "video":
    case "local_video":
      return <PlayIcon className={cls} />;
    case "image":
      return <PhotoIcon className={cls} />;
    case "storyboard":
      return <StoryboardIcon className={cls} />;
    default:
      return <DocumentIcon className={cls} />;
  }
}
