// Shared between server actions and client components — keep free of server-only imports.

/** A storyboard step: a library image, in order, with its caption. */
export interface StoryboardFrame {
  media_id: number;
  caption: string;
}

/**
 * Parses storyboard resource content. Tolerates both formats that pre-date the
 * media library — an array of `/files/…` paths, and `{ src, caption }` objects —
 * by dropping frames it can't resolve to a media id, so a half-migrated row
 * degrades instead of throwing.
 */
export function parseStoryboardFrames(content: string): StoryboardFrame[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((frame): StoryboardFrame => {
        const record = (typeof frame === "object" ? frame : null) as Record<string, unknown> | null;
        return {
          media_id: Number(record?.media_id ?? 0),
          caption: String(record?.caption ?? ""),
        };
      })
      .filter((frame) => Number.isInteger(frame.media_id) && frame.media_id > 0);
  } catch {
    return [];
  }
}

export function serialiseStoryboardFrames(frames: StoryboardFrame[]): string {
  return JSON.stringify(frames);
}
