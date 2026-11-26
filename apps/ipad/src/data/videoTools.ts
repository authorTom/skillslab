/**
 * Learning controls for an uploaded video: chapters, slower speeds, a short
 * replay and an A–B loop. Mirrors the web app's src/lib/chapters.ts and
 * src/lib/video-tools.ts.
 */

export interface Chapter {
  time: number;
  title: string;
}

/** A resource's chapters, as the release stores them (a JSON array). Bad or
 *  missing data means no chapters, never an error. */
export function parseChapters(json: string | null | undefined): Chapter[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Chapter =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Chapter).time === "number" &&
          Number.isFinite((c as Chapter).time) &&
          (c as Chapter).time >= 0 &&
          typeof (c as Chapter).title === "string" &&
          (c as Chapter).title.trim() !== ""
      )
      .map((c) => ({ time: c.time, title: c.title.trim() }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
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

/** "1:05", or "1:02:05" past the hour. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25] as const;

/** How far "replay" jumps back, in seconds. */
export const REPLAY_SECONDS = 5;

/** An A–B loop: plays from `start` to `end`, then back to `start`. */
export interface LoopRange {
  start: number | null;
  end: number | null;
}

export const NO_LOOP: LoopRange = { start: null, end: null };

/** A loop shorter than this is almost certainly a double tap. */
const MIN_LOOP_SECONDS = 0.5;

/** The first press marks the start, the second the end, the third clears.
 *  An end marked before the start swaps them. */
export function pressLoop(loop: LoopRange, time: number): LoopRange {
  if (loop.start === null) return { start: time, end: null };
  if (loop.end === null) {
    if (Math.abs(time - loop.start) < MIN_LOOP_SECONDS) return loop;
    return time < loop.start ? { start: time, end: loop.start } : { start: loop.start, end: time };
  }
  return NO_LOOP;
}

/** Where playback should jump to at `time`, or null to carry on. */
export function loopJump(loop: LoopRange, time: number): number | null {
  if (loop.start === null || loop.end === null) return null;
  return time >= loop.end ? loop.start : null;
}
