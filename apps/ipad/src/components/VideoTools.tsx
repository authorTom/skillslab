import { useEffect, useState } from "react";
import {
  chapterAt,
  formatTimestamp,
  loopJump,
  NO_LOOP,
  PLAYBACK_RATES,
  pressLoop,
  REPLAY_SECONDS,
  type Chapter,
  type LoopRange,
} from "@/data/videoTools";
import { Eyebrow } from "./PageTitle";
import { RepeatIcon, ReplayIcon } from "./icons";

/**
 * Controls for learning from a video, under the player: slower speeds, a
 * short replay, an A–B loop for repeating one movement, and chapters.
 */
export default function VideoTools({
  video,
  chapters,
  ready,
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  chapters: Chapter[];
  /** False until the video's metadata has loaded; seeking fails before that. */
  ready: boolean;
}) {
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState<LoopRange>(NO_LOOP);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    // iOS's full-screen player has its own speed menu.
    const onRate = () => setRate(v.playbackRate);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("ratechange", onRate);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("ratechange", onRate);
    };
  }, [video]);

  // timeupdate fires only a few times a second, too coarse to end a loop
  // cleanly, so check every frame while a loop is set.
  useEffect(() => {
    const v = video.current;
    if (!v || loop.end === null) return;
    let frame = 0;
    const tick = () => {
      const jump = loopJump(loop, v.currentTime);
      if (jump !== null) v.currentTime = jump;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video, loop]);

  function changeRate(next: number) {
    const v = video.current;
    if (!v) return;
    v.playbackRate = next;
    v.defaultPlaybackRate = next;
    setRate(next);
  }

  function seek(to: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = to;
    setTime(to);
    void v.play().catch(() => {});
  }

  function markLoop() {
    const v = video.current;
    if (!v) return;
    const next = pressLoop(loop, v.currentTime);
    setLoop(next);
    if (next.start !== null && next.end !== null) seek(next.start);
  }

  const current = chapterAt(chapters, time);
  const looping = loop.start !== null && loop.end !== null;
  const loopLabel =
    loop.start === null
      ? "Loop"
      : loop.end === null
        ? `From ${formatTimestamp(loop.start)} · tap at end`
        : `${formatTimestamp(loop.start)}–${formatTimestamp(loop.end)} · Stop`;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          role="group"
          aria-label="Playback speed"
          className="flex rounded-full bg-surface p-1 shadow-card ring-1 ring-line"
        >
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rate === r}
              aria-label={`${r} times speed`}
              disabled={!ready}
              onClick={() => changeRate(r)}
              className={`min-h-11 min-w-14 rounded-full px-3 font-mono text-[0.875rem] tabular-nums transition duration-150 active:scale-[0.96] disabled:opacity-45 ${
                rate === r ? "bg-ink text-canvas" : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              {r}×
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const v = video.current;
            if (v) seek(Math.max(0, v.currentTime - REPLAY_SECONDS));
          }}
          disabled={!ready}
          className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-[0.9375rem] font-medium text-ink shadow-card ring-1 ring-line transition active:scale-[0.97] disabled:opacity-45"
        >
          <ReplayIcon className="h-4 w-4" />
          Back {REPLAY_SECONDS} s
        </button>

        <button
          type="button"
          onClick={markLoop}
          disabled={!ready}
          aria-pressed={loop.start !== null}
          aria-label={
            loop.start === null
              ? "Loop a section: mark its start"
              : loop.end === null
                ? `Loop from ${formatTimestamp(loop.start)}: mark its end`
                : `Stop looping ${formatTimestamp(loop.start)} to ${formatTimestamp(loop.end)}`
          }
          className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium ring-1 ring-inset transition active:scale-[0.97] disabled:opacity-45 ${
            loop.start !== null
              ? "bg-accent-soft text-accent-ink ring-accent/40"
              : "bg-surface text-ink shadow-card ring-line"
          }`}
        >
          <RepeatIcon className={`h-4 w-4 ${looping ? "animate-pulse" : ""}`} />
          <span className="font-mono text-[0.875rem] tabular-nums">{loopLabel}</span>
        </button>
      </div>

      {chapters.length > 0 && (
        <div>
          <Eyebrow tone="muted">Chapters</Eyebrow>
          <ol aria-label="Chapters" className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {chapters.map((chapter, i) => {
              const active = i === current;
              return (
                <li key={`${chapter.time}-${i}`}>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => seek(chapter.time)}
                    aria-current={active ? "true" : undefined}
                    className={`flex min-h-12 w-full items-center gap-3.5 rounded-xl px-3.5 py-2 text-left transition active:scale-[0.99] disabled:opacity-45 ${
                      active ? "bg-surface shadow-card ring-2 ring-accent" : "bg-surface/60 ring-1 ring-line hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`w-14 shrink-0 font-mono text-[0.8125rem] tabular-nums ${
                        active ? "text-accent-ink" : "text-ink-3"
                      }`}
                    >
                      {formatTimestamp(chapter.time)}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-ink">{chapter.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
