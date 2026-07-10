// Shared between server actions and client components — keep free of server-only imports.

export interface StoryboardFrame {
  src: string;
  caption: string;
}

/** Parses storyboard resource content; tolerates the legacy plain-array-of-paths format. */
export function parseStoryboardFrames(content: string): StoryboardFrame[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((frame): StoryboardFrame => {
        if (typeof frame === "string") return { src: frame, caption: "" };
        const record = frame as Record<string, unknown> | null;
        return { src: String(record?.src ?? ""), caption: String(record?.caption ?? "") };
      })
      .filter((frame) => frame.src);
  } catch {
    return [];
  }
}
