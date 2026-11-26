// Shared between server actions and client components — keep free of server-only imports.

/** A named point in an uploaded video, in seconds from the start. */
export interface Chapter {
  time: number;
  title: string;
}

export type ChapterParse = { ok: true; chapters: Chapter[] } | { ok: false; error: string };

const LINE = /^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*(?:[-–—:|]\s*)?(.*?)\s*$/;

/**
 * Reads the chapter list an editor typed: one chapter per line, a time then
 * a name, such as "1:05 Apply the tourniquet" or "0:01:05 – Apply the
 * tourniquet". Blank lines are skipped. Chapters come back in time order.
 */
export function parseChapters(text: string): ChapterParse {
  const chapters: Chapter[] = [];
  const lines = text.split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const match = LINE.exec(raw);
    const seconds = match ? Number(match[3]) : NaN;
    if (!match || seconds >= 60 || (match[1] !== undefined && Number(match[2]) >= 60)) {
      return {
        ok: false,
        error: `Line ${i + 1} of the chapters isn’t a time and a name, like “1:05 Apply the tourniquet”.`,
      };
    }
    const title = match[4];
    if (!title) {
      return { ok: false, error: `Line ${i + 1} of the chapters needs a name after the time.` };
    }
    const time = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + seconds;
    chapters.push({ time, title });
  }
  chapters.sort((a, b) => a.time - b.time);
  return { ok: true, chapters };
}

/** Chapters stored on a resource, or none if the text can't be read. */
export function chaptersOf(text: string | null | undefined): Chapter[] {
  const parsed = parseChapters(text ?? "");
  return parsed.ok ? parsed.chapters : [];
}

/** "1:05", or "1:02:05" past the hour. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** The text stored for a chapter list: one "m:ss Name" line each, in order. */
export function serialiseChapters(chapters: Chapter[]): string {
  return chapters.map((c) => `${formatTimestamp(c.time)} ${c.title}`).join("\n");
}

/** Index of the chapter playing at `time`, or -1 before the first. */
export function chapterAt(chapters: Chapter[], time: number): number {
  let index = -1;
  for (const [i, chapter] of chapters.entries()) {
    if (chapter.time <= time + 0.05) index = i;
    else break;
  }
  return index;
}
