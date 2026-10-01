import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "@/hooks/useModal";
import Button from "./Button";
import { Eyebrow } from "./PageTitle";
import { CheckIcon, ChecklistIcon, PhotoIcon, RefreshIcon, TimerIcon } from "./icons";

export interface PracticeStep {
  src: string;
  alt: string;
  caption: string;
}

/** Ticked steps and timing for one storyboard. Held by the skill screen, so
 *  closing practice and switching resources keeps it until the skill is left. */
export interface PracticeProgress {
  done: number[];
  startedAt: number | null;
  finishedAt: number | null;
}

export const NO_PRACTICE: PracticeProgress = { done: [], startedAt: null, finishedAt: null };

const pad = (n: number) => String(n).padStart(2, "0");

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Toggle step `index`, starting the timer on the first tick and stopping it
 *  when every step is done. */
export function toggleStep(
  progress: PracticeProgress,
  index: number,
  total: number,
  now = Date.now()
): PracticeProgress {
  const done = progress.done.includes(index)
    ? progress.done.filter((i) => i !== index)
    : [...progress.done, index];
  return {
    done,
    startedAt: progress.startedAt ?? now,
    finishedAt: done.length === total ? (progress.finishedAt ?? now) : null,
  };
}

interface PracticeModeProps {
  title: string;
  steps: PracticeStep[];
  progress: PracticeProgress;
  onChange: (progress: PracticeProgress) => void;
  onClose: () => void;
}

/**
 * Practice mode: the storyboard's steps as a checklist to tick off while
 * performing the skill, with a timer that runs from the first tick to the
 * last. Reset clears it for the next student.
 */
export default function PracticeMode({ title, steps, progress, onChange, onClose }: PracticeModeProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [showPictures, setShowPictures] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useModal(dialog, onClose);

  const total = steps.length;
  const doneCount = progress.done.length;
  const finished = progress.finishedAt !== null;
  const running = progress.startedAt !== null && !finished;
  const elapsed = progress.startedAt === null ? 0 : (progress.finishedAt ?? now) - progress.startedAt;
  const nextIndex = steps.findIndex((_, i) => !progress.done.includes(i));
  const next = nextIndex >= 0 ? steps[nextIndex] : null;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  function toggle(index: number) {
    const next = toggleStep(progress, index, total);
    // The first tick starts the clock at 0:00 rather than a stale `now`.
    setNow((n) => Math.max(n, next.startedAt ?? n));
    onChange(next);
  }

  const completion = (
    <div className="animate-fade-in rounded-[1.25rem] bg-success-soft p-5 text-success-ink">
      <p className="flex items-center gap-2 text-[1.0625rem] font-semibold">
        <CheckIcon className="h-5 w-5" />
        All {total} steps done
      </p>
      <p className="mt-1 text-[0.9375rem]">
        Finished in <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>.
      </p>
      <Button className="mt-4" icon={<RefreshIcon className="h-4 w-4" />} onClick={() => onChange(NO_PRACTICE)}>
        Practise again
      </Button>
    </div>
  );

  // Portalled to the body so no styled ancestor can affect the fixed overlay.
  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas"
    >
      <header className="safe-top shrink-0 border-b border-line bg-canvas">
        <div className="flex min-h-16 items-center gap-3 px-3 sm:px-6">
          <div className="flex flex-1 items-center">
            <Button variant="plain" onClick={onClose}>
              Done
            </Button>
          </div>
          <div className="min-w-0 max-w-[50%] text-center">
            <Eyebrow>Practice</Eyebrow>
            <h2 id={titleId} className="truncate text-[1.0625rem] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
          </div>
          <div className="flex flex-1 items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setShowPictures((s) => !s)}
              aria-pressed={showPictures}
              aria-label="Show pictures"
              className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 ${
                showPictures ? "text-accent-ink hover:bg-accent-soft" : "bg-ink text-canvas"
              }`}
            >
              <PhotoIcon className="h-5 w-5" />
            </button>
            <Button
              variant="secondary"
              icon={<RefreshIcon className="h-4 w-4" />}
              disabled={doneCount === 0 && progress.startedAt === null}
              onClick={() => onChange(NO_PRACTICE)}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 px-6 pb-4">
          <div
            role="progressbar"
            aria-label="Steps done"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
            aria-valuetext={`${doneCount} of ${total} steps done`}
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${finished ? "bg-success-ink" : "bg-accent"}`}
              style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
            />
          </div>
          <span className="font-mono text-[0.8125rem] tabular-nums text-ink-2" aria-hidden="true">
            {doneCount}/{total}
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[0.9375rem] tabular-nums ${
              running ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-ink-2"
            }`}
          >
            <TimerIcon className="h-4 w-4" />
            <span className="sr-only">Time </span>
            {formatElapsed(elapsed)}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="safe-bottom mx-auto max-w-[76rem] px-6 pb-10 pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10">
          <div>
            <p className="sr-only" aria-live="polite">
              {finished ? `All ${total} steps done in ${formatElapsed(elapsed)}.` : ""}
            </p>
            {finished && <div className="mb-5 lg:hidden">{completion}</div>}
            {progress.startedAt === null && (
              <p className="mb-4 text-[0.9375rem] text-ink-2">
                Tick each step as you perform it. The timer starts with the first tick.
              </p>
            )}

            <ol className="space-y-2.5" aria-label="Steps">
              {steps.map((step, i) => {
                const checked = progress.done.includes(i);
                const current = i === nextIndex;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(i)}
                      className={`flex min-h-16 w-full items-center gap-4 rounded-2xl p-3 pr-4 text-left shadow-card ring-inset transition duration-150 active:scale-[0.99] ${
                        checked
                          ? "bg-surface-2 ring-1 ring-line"
                          : current
                            ? "bg-surface ring-2 ring-accent"
                            : "bg-surface ring-1 ring-line"
                      }`}
                    >
                      <span
                        className={`w-7 shrink-0 text-center font-mono text-[0.8125rem] tabular-nums ${
                          current ? "text-accent-ink" : "text-ink-3"
                        }`}
                      >
                        <span className="sr-only">Step </span>
                        {pad(i + 1)}
                      </span>
                      {showPictures && step.src && (
                        <img
                          src={step.src}
                          alt=""
                          draggable={false}
                          className={`h-16 w-24 shrink-0 rounded-lg bg-stage object-cover transition ${checked ? "opacity-50" : ""}`}
                        />
                      )}
                      <span
                        className={`min-w-0 flex-1 text-[1.0625rem] leading-snug ${
                          checked ? "text-ink-2 line-through decoration-ink-3/60" : "text-ink"
                        }`}
                      >
                        {step.caption || `Step ${i + 1}`}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                          checked ? "bg-accent text-on-accent" : "ring-2 ring-inset ring-line-strong"
                        }`}
                      >
                        {checked && <CheckIcon className="h-4.5 w-4.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Landscape: the next step, large, beside the list. */}
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              {finished ? (
                completion
              ) : next ? (
                <div>
                  <Eyebrow tone="muted">Next · Step {pad(nextIndex + 1)}</Eyebrow>
                  {showPictures && next.src ? (
                    <div className="relative mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[1.25rem] bg-stage shadow-raised">
                      <img
                        key={nextIndex}
                        src={next.src}
                        alt={next.alt || next.caption || `Step ${nextIndex + 1}`}
                        draggable={false}
                        className="max-h-full max-w-full animate-fade-in object-contain"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-[1.25rem] border border-dashed border-line-strong text-ink-3">
                      <ChecklistIcon className="h-8 w-8" />
                    </div>
                  )}
                  <p key={`c-${nextIndex}`} className="mt-4 animate-fade-in font-display text-[1.375rem] leading-snug tracking-[-0.01em] text-pretty">
                    {next.caption || `Step ${nextIndex + 1}`}
                  </p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}
