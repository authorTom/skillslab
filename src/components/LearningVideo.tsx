"use client";

import { useEffect, useRef, useState } from "react";
import { chapterAt, formatTimestamp, type Chapter } from "@/lib/chapters";
import {
  formatRate,
  loopJump,
  NO_LOOP,
  PLAYBACK_RATES,
  pressLoop,
  REPLAY_SECONDS,
  type LoopRange,
} from "@/lib/video-tools";

/**
 * An uploaded video with learning controls under it: slower speeds, a short
 * replay, an A–B loop for repeating one movement, and the video's chapters.
 */
export default function LearningVideo({
  src,
  title,
  chapters,
}: {
  src: string;
  title: string;
  chapters: Chapter[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState<LoopRange>(NO_LOOP);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    // The browser's own controls can change the speed too.
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

  // While a loop is set, check every frame: timeupdate is too coarse to stop
  // cleanly at the loop's end.
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

  function replay() {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - REPLAY_SECONDS);
    void v.play().catch(() => {});
  }

  function seek(to: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = to;
    void v.play().catch(() => {});
  }

  function markLoop() {
    const v = video.current;
    if (!v) return;
    const next = pressLoop(loop, v.currentTime);
    setLoop(next);
    if (next.end !== null) seek(next.start ?? 0);
  }

  const current = chapterAt(chapters, time);
  const loopLabel =
    loop.start === null
      ? "Loop: mark start"
      : loop.end === null
        ? `Loop from ${formatTimestamp(loop.start)}: mark end`
        : `Looping ${formatTimestamp(loop.start)}–${formatTimestamp(loop.end)} · Stop`;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${
      active ? "bg-teal-600 text-white" : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <>
      <div className="aspect-video bg-black">
        <video
          ref={video}
          src={src}
          controls
          playsInline
          className="h-full w-full"
          title={title}
        >
          Your browser does not support the video element.
        </video>
      </div>
      <div className="border-t border-stone-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Playback speed"
            className="flex rounded-full border border-stone-200 p-0.5"
          >
            {PLAYBACK_RATES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rate === r}
                onClick={() => changeRate(r)}
                className={chip(rate === r)}
              >
                {formatRate(r)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={replay}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
          >
            ↺ Back {REPLAY_SECONDS} s
          </button>
          <button
            type="button"
            onClick={markLoop}
            aria-pressed={loop.start !== null}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              loop.start !== null
                ? "border-teal-600 bg-teal-50 text-teal-800"
                : "border-stone-200 text-stone-600 hover:bg-stone-100"
            }`}
          >
            {loopLabel}
          </button>
        </div>

        {chapters.length > 0 && (
          <ol aria-label="Chapters" className="mt-4 grid gap-1 sm:grid-cols-2">
            {chapters.map((chapter, i) => (
              <li key={`${chapter.time}-${i}`}>
                <button
                  type="button"
                  onClick={() => seek(chapter.time)}
                  aria-current={i === current ? "true" : undefined}
                  className={`flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                    i === current
                      ? "bg-teal-50 text-teal-900"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-stone-400">
                    {formatTimestamp(chapter.time)}
                  </span>
                  <span className="min-w-0 flex-1">{chapter.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
