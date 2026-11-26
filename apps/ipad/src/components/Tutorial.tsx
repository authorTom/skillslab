import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "@/hooks/useModal";
import { TUTORIAL_SLIDES, type TutorialArt } from "@/data/tutorial";
import BrandMark from "./BrandMark";
import Button from "./Button";
import { Eyebrow } from "./PageTitle";
import {
  AlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  ExpandIcon,
  RepeatIcon,
  ReplayIcon,
  SearchIcon,
  SparklesIcon,
  TimerIcon,
} from "./icons";

/**
 * A full-screen, step-by-step tour of the app's main features. Swipe or use
 * the arrow keys to move through it; Skip or Done closes it.
 */
export default function Tutorial({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  useModal(dialog, onClose);

  const slide = TUTORIAL_SLIDES[index];
  const last = TUTORIAL_SLIDES.length - 1;
  const go = (i: number) => setIndex(Math.min(Math.max(i, 0), last));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, last));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-roledescription="tutorial"
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas"
    >
      <header className="safe-top shrink-0">
        <div className="flex min-h-16 items-center justify-between gap-3 px-3 sm:px-6">
          <p className="pl-3 font-mono text-[0.75rem] uppercase tracking-[0.12em] text-ink-3">
            How to use SkillsLab
          </p>
          <Button variant="plain" onClick={onClose}>
            {index === last ? "Close" : "Skip"}
          </Button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") swipeStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipeStart.current === null) return;
          const dx = e.clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? index + 1 : index - 1);
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <div
          key={slide.id}
          className="mx-auto grid w-full max-w-[72rem] flex-1 animate-fade-in content-center gap-8 px-6 py-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-14"
        >
          <div aria-hidden="true">
            <Art art={slide.id} />
          </div>
          <div aria-live="polite">
            <Eyebrow>
              {slide.eyebrow} · {index + 1} of {TUTORIAL_SLIDES.length}
            </Eyebrow>
            <h2
              id={titleId}
              className="mt-3 font-display text-[2.25rem] leading-[1.05] tracking-[-0.022em] text-balance sm:text-[2.75rem]"
            >
              {slide.title}
            </h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">{slide.body}</p>
            <ul className="mt-6 space-y-3">
              {slide.tips.map((tip, i) => (
                <li key={i} className="flex gap-3 text-[1rem] leading-snug text-ink">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <footer className="safe-bottom shrink-0 border-t border-line">
        <div className="mx-auto flex min-h-20 max-w-[72rem] items-center gap-4 px-6 sm:px-10 lg:px-14">
          <div className="flex flex-1 items-center">
            <Button
              variant="secondary"
              icon={<ChevronLeftIcon className="h-4 w-4" />}
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              Back
            </Button>
          </div>
          <ol className="flex items-center" aria-label="Tutorial pages">
            {TUTORIAL_SLIDES.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Page ${i + 1}: ${s.title}`}
                  aria-current={i === index ? "step" : undefined}
                  className="flex h-11 w-7 items-center justify-center"
                >
                  <span
                    className={`block h-2 rounded-full transition-all duration-300 ${
                      i === index ? "w-5 bg-accent" : "w-2 bg-line-strong"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-1 items-center justify-end">
            {index === last ? (
              <Button onClick={onClose} icon={<CheckIcon className="h-4 w-4" />}>
                Start using SkillsLab
              </Button>
            ) : (
              <Button onClick={() => go(index + 1)}>
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>,
    document.body
  );
}

/* ---------------- Illustrations: small, decorative mock-ups ---------------- */

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[20rem] w-full items-center justify-center overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-accent-soft via-surface-2 to-surface-3 px-6 py-10 shadow-raised ring-1 ring-line sm:px-10 lg:min-h-[28rem]">
      {children}
    </div>
  );
}

const panel = "rounded-2xl bg-surface shadow-card ring-1 ring-line";

function Art({ art }: { art: TutorialArt }) {
  switch (art) {
    case "welcome":
      return (
        <Stage>
          <div className="flex flex-col items-center gap-5">
            <BrandMark className="h-28 w-28 drop-shadow-lg" />
            <p className="font-display text-[2rem] italic tracking-[-0.02em]">SkillsLab</p>
          </div>
        </Stage>
      );
    case "find":
      return (
        <Stage>
          <div className="w-full max-w-sm space-y-4">
            <div className={`${panel} flex h-12 items-center gap-3 px-4 text-ink-3`}>
              <SearchIcon className="h-5 w-5" />
              <span className="text-[0.9375rem]">Search skills</span>
            </div>
            <div className="flex gap-2">
              {["All", "Procedures", "Assessment"].map((c, i) => (
                <span
                  key={c}
                  className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium ${
                    i === 0 ? "bg-ink text-canvas" : "bg-surface text-ink ring-1 ring-line"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className={`aspect-[3/2] rounded-xl ${i === 0 ? "bg-accent/70" : "bg-surface-3"}`} />
                  <div className="mt-2 h-2 w-3/4 rounded bg-ink/20" />
                </div>
              ))}
            </div>
          </div>
        </Stage>
      );
    case "skill":
      return (
        <Stage>
          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            <MiniList title="Indications" />
            <MiniList title="Equipment" />
            <div className="col-span-2 rounded-2xl bg-danger-soft p-4 ring-1 ring-danger-ink/25">
              <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-danger-ink">
                <AlertIcon className="h-4 w-4" /> Red flags: stop if…
              </p>
              <div className="mt-2.5 space-y-1.5">
                <div className="h-2 w-4/5 rounded bg-danger-ink/30" />
                <div className="h-2 w-3/5 rounded bg-danger-ink/30" />
              </div>
            </div>
          </div>
        </Stage>
      );
    case "video":
      return (
        <Stage>
          <div className="w-full max-w-md">
            <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-black shadow-raised">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
                <span className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-black" />
              </span>
              <div className="absolute inset-x-4 bottom-3 h-1 rounded-full bg-white/30">
                <div className="absolute left-[35%] right-[40%] h-1 rounded-full bg-accent" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`${panel} flex rounded-full p-1 font-mono text-[0.75rem]`}>
                {["0.5×", "0.75×", "1×"].map((r, i) => (
                  <span key={r} className={`rounded-full px-2.5 py-1 ${i === 0 ? "bg-ink text-canvas" : "text-ink-2"}`}>
                    {r}
                  </span>
                ))}
              </span>
              <span className={`${panel} flex items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-medium`}>
                <ReplayIcon className="h-3.5 w-3.5" /> Back 5 s
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 font-mono text-[0.75rem] text-accent-ink ring-1 ring-accent/40">
                <RepeatIcon className="h-3.5 w-3.5" /> 0:42–0:51
              </span>
            </div>
            <div className={`${panel} mt-3 divide-y divide-line`}>
              {["0:00 Introduction", "0:42 Apply the tourniquet"].map((c, i) => (
                <p key={c} className={`px-3.5 py-2 text-[0.8125rem] ${i === 1 ? "text-accent-ink" : "text-ink-2"}`}>
                  <span className="font-mono">{c.split(" ")[0]}</span> {c.split(" ").slice(1).join(" ")}
                </p>
              ))}
            </div>
          </div>
        </Stage>
      );
    case "storyboard":
      return (
        <Stage>
          <div className="w-full max-w-md">
            <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl bg-stage shadow-raised">
              <div className="h-1/2 w-1/2 rounded-xl bg-white/15" />
              <span className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-black">
                <ChevronLeftIcon className="h-5 w-5" />
              </span>
              <span className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent">
                <ChevronRightIcon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i < 2 ? "bg-accent/45" : i === 2 ? "bg-accent" : "bg-line-strong"}`} />
              ))}
            </div>
            <p className="mt-3 font-display text-[1.125rem]">
              <span className="font-mono text-[0.875rem] text-accent-ink">03/05 </span>Anchor the vein below the site
            </p>
          </div>
        </Stage>
      );
    case "practice":
      return (
        <Stage>
          <div className="w-full max-w-md space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-2/5 rounded-full bg-accent" />
              </div>
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.75rem] text-accent-ink">
                <TimerIcon className="h-3.5 w-3.5" /> 1:24
              </span>
            </div>
            {["Introduce yourself and confirm identity", "Clean hands and put on gloves", "Apply the tourniquet"].map(
              (step, i) => (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-xl p-3 shadow-card ${
                    i < 2 ? "bg-surface-2 ring-1 ring-line" : "bg-surface ring-2 ring-accent"
                  }`}
                >
                  <span className="w-5 font-mono text-[0.75rem] text-ink-3">0{i + 1}</span>
                  <span className={`flex-1 text-[0.875rem] ${i < 2 ? "text-ink-2 line-through" : "text-ink"}`}>{step}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      i < 2 ? "bg-accent text-on-accent" : "ring-2 ring-inset ring-line-strong"
                    }`}
                  >
                    {i < 2 && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                </div>
              )
            )}
          </div>
        </Stage>
      );
    case "documents":
      return (
        <Stage>
          <div className="relative">
            <div className={`${panel} flex h-56 w-44 flex-col gap-2.5 p-5`}>
              <DocumentIcon className="h-6 w-6 text-accent-ink" />
              {[90, 70, 85, 60, 75, 50].map((w, i) => (
                <div key={i} className="h-1.5 rounded bg-ink/15" style={{ width: `${w}%` }} />
              ))}
            </div>
            <span className="absolute -bottom-4 -right-6 flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[0.8125rem] font-medium text-canvas shadow-raised">
              <ExpandIcon className="h-3.5 w-3.5" /> Pinch to zoom
            </span>
          </div>
        </Stage>
      );
    case "updates":
      return (
        <Stage>
          <div className={`${panel} w-full max-w-sm p-5`}>
            <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                <SparklesIcon className="h-4 w-4" />
              </span>
              What’s new in content v1.4
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["New", "Venepuncture"],
                ["Updated", "Basic Life Support"],
              ].map(([kind, title]) => (
                <span key={title} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1.5 pr-3 text-[0.8125rem] ring-1 ring-line">
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase ${
                      kind === "New" ? "bg-accent text-on-accent" : "bg-surface-3 text-ink-2"
                    }`}
                  >
                    {kind}
                  </span>
                  {title}
                </span>
              ))}
            </div>
          </div>
        </Stage>
      );
  }
}

function MiniList({ title }: { title: string }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-[0.875rem] font-semibold">{title}</p>
      <div className="mt-2.5 space-y-1.5">
        <div className="h-2 w-4/5 rounded bg-ink/15" />
        <div className="h-2 w-3/5 rounded bg-ink/15" />
        <div className="h-2 w-2/3 rounded bg-ink/15" />
      </div>
    </div>
  );
}
