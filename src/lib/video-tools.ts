// Shared between server actions and client components — keep free of server-only imports.

/** Speeds offered under an uploaded video. Slower is for learning a technique. */
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

/**
 * The loop after the loop button is pressed at `time`: the first press marks
 * the start, the second the end, and the third clears it. An end marked
 * before the start swaps them, so the loop always runs forwards.
 */
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

export function formatRate(rate: number): string {
  return `${rate}×`;
}
