import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { Resource, StoryboardFrame } from "@/data/types";
import { assetUrl, mediaUrl } from "@/data/assets";
import { listStoryboardFrames, getMedia } from "@/data/catalogue";
import Card from "./Card";
import Button, { buttonClass } from "./Button";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import { Eyebrow } from "./PageTitle";
import ResourceIcon, { resourceTypeLabel } from "./ResourceIcon";
import PracticeMode, { NO_PRACTICE, type PracticeProgress } from "./PracticeMode";
import {
  ChecklistIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  ExpandIcon,
  ExternalLinkIcon,
  PhotoIcon,
  StoryboardIcon,
  WifiOffIcon,
} from "./icons";

interface ResolvedFrame {
  position: number;
  src: string;
  alt: string;
  caption: string;
}

interface ResourceViewerProps {
  resources: Resource[];
  /** Title block shown above the resource list (beside the media in landscape). */
  intro: React.ReactNode;
}

const pad = (n: number) => String(n).padStart(2, "0");

// pdf.js is large, so it loads only when a PDF is first opened.
const PdfViewer = lazy(() => import("./PdfViewer"));

/**
 * The skill screen body. Landscape is a split view: a sticky column holding
 * the title and a numbered contents list, beside a full-height media stage.
 * Portrait stacks them, with the contents as a row of tabs.
 */
export default function ResourceViewer({ resources, intro }: ResourceViewerProps) {
  const [activeId, setActiveId] = useState(resources[0]?.id);
  const active = resources.find((r) => r.id === activeId) ?? resources[0];
  // Practice progress per storyboard, kept while the skill is open so that
  // looking at another resource mid-practice doesn't lose the ticks.
  const [practice, setPractice] = useState<Record<number, PracticeProgress>>({});
  // Likewise the step each storyboard is showing.
  const [steps, setSteps] = useState<Record<number, number>>({});
  const tabs = useRef(new Map<number, HTMLButtonElement>());
  const baseId = useId();
  const tabId = (id: number) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  // WAI-ARIA tabs pattern: arrow keys move between resources (the list is
  // horizontal in portrait and vertical in landscape, so accept both axes).
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!active) return;
    const index = resources.findIndex((r) => r.id === active.id);
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % resources.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + resources.length) % resources.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = resources.length - 1;
    else return;
    e.preventDefault();
    const id = resources[next].id;
    setActiveId(id);
    tabs.current.get(id)?.focus();
  }

  return (
    <main className="safe-bottom px-6 pb-20 pt-4 sm:px-10 lg:grid lg:grid-cols-[minmax(288px,368px)_minmax(0,1fr)] lg:gap-[56px] lg:px-[48px] lg:pb-0 lg:pt-0">
      <div className="scrollbar-none lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:pb-10 lg:pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        {intro}

        {active && (
          <>
            <div className="mb-3 mt-10 hidden items-baseline justify-between border-t border-line pt-5 lg:flex">
              <Eyebrow tone="muted">Contents</Eyebrow>
              <span className="font-mono text-[0.75rem] tabular-nums text-ink-3">{pad(resources.length)}</span>
            </div>
            <div
              role="tablist"
              aria-label="Resources"
              onKeyDown={handleKeyDown}
              className="-mx-6 mt-8 flex gap-2 overflow-x-auto px-6 py-1 scrollbar-none sm:-mx-10 sm:px-10 lg:mx-0 lg:mt-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
            >
              {resources.map((resource, i) => {
                const isActive = resource.id === active.id;
                return (
                  <button
                    key={resource.id}
                    ref={(el) => {
                      if (el) tabs.current.set(resource.id, el);
                      else tabs.current.delete(resource.id);
                    }}
                    id={tabId(resource.id)}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={panelId}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveId(resource.id)}
                    className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-full px-4 text-left ring-1 ring-inset transition duration-150 active:scale-[0.98] lg:min-h-15 lg:w-full lg:gap-4 lg:rounded-xl lg:px-3 lg:py-2.5 ${
                      isActive
                        ? "bg-ink text-canvas ring-ink lg:bg-surface lg:text-ink lg:shadow-card lg:ring-line"
                        : "bg-surface text-ink ring-line hover:ring-line-strong lg:bg-transparent lg:ring-transparent lg:hover:bg-surface/60"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`hidden w-6 font-mono text-[0.75rem] tabular-nums lg:block ${
                        isActive ? "text-accent-ink" : "text-ink-3"
                      }`}
                    >
                      {pad(i + 1)}
                    </span>
                    <ResourceIcon
                      type={resource.type}
                      className={`h-4 w-4 shrink-0 lg:hidden ${isActive ? "" : "text-ink-3"}`}
                    />
                    <span className="min-w-0 lg:flex-1">
                      <span
                        className={`block max-w-[16rem] truncate text-[0.9375rem] font-medium leading-snug lg:max-w-none lg:whitespace-normal lg:break-words ${
                          isActive ? "lg:text-ink" : "lg:text-ink-2"
                        }`}
                      >
                        {resource.title}
                      </span>
                      <span className="mt-0.5 hidden font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-ink-3 lg:block">
                        {resourceTypeLabel(resource.type)}
                      </span>
                    </span>
                    <span
                      className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-full transition lg:flex ${
                        isActive ? "bg-accent text-on-accent" : "text-ink-3"
                      }`}
                    >
                      <ResourceIcon type={resource.type} className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 min-w-0 lg:mt-0 lg:pb-10 lg:pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        {active ? (
          <div role="tabpanel" id={panelId} aria-labelledby={tabId(active.id)}>
            <div key={active.id} className="animate-fade-in">
              <ResourcePanel
                resource={active}
                practice={practice[active.id] ?? NO_PRACTICE}
                onPractice={(progress) => setPractice((p) => ({ ...p, [active.id]: progress }))}
                step={steps[active.id] ?? 0}
                onStep={(step) => setSteps((s) => ({ ...s, [active.id]: step }))}
              />
            </div>
          </div>
        ) : (
          <EmptyState outlined icon={<StoryboardIcon className="h-7 w-7" />} title="No resources yet">
            Materials for this skill haven’t been added. Check back after a content update.
          </EmptyState>
        )}
      </div>
    </main>
  );
}

function ResourcePanel({
  resource,
  practice,
  onPractice,
  step,
  onStep,
}: {
  resource: Resource;
  practice: PracticeProgress;
  onPractice: (progress: PracticeProgress) => void;
  step: number;
  onStep: (step: number) => void;
}) {
  switch (resource.type) {
    case "video":
      // Releases built before uploaded videos kept their own type exported
      // them as "video" with a bundled asset; play those from the file.
      if (resource.asset) {
        return <LocalVideoPanel resource={resource} />;
      }
      return <VimeoPanel resource={resource} />;
    case "local_video":
      return <LocalVideoPanel resource={resource} />;
    case "pdf":
      return <PdfPanel resource={resource} />;
    case "image":
      return <ImagePanel resource={resource} />;
    case "storyboard":
      return (
        <StoryboardPanel resource={resource} practice={practice} onPractice={onPractice} step={step} onStep={onStep} />
      );
    default:
      return (
        <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="Can’t open this resource">
          This version of the app doesn’t support this type of resource.
        </EmptyState>
      );
  }
}

const STAGE = "overflow-hidden rounded-[1.5rem] bg-stage shadow-raised";
/** Media height: fills the landscape column, and leaves room below in portrait.
 *  In px, not rem, so a large text size doesn't squeeze the media. */
const STAGE_HEIGHT = "h-[clamp(288px,calc(100dvh-544px),672px)] lg:h-[clamp(320px,calc(100dvh-240px),832px)]";

/** A blurred, enlarged copy of the image behind it, so media that doesn't
 *  match the stage's shape sits in its own colour rather than black bars. */
function Ambient({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl saturate-150"
    />
  );
}

/** A museum-style label under a piece of media. */
function MediaLabel({ resource, children }: { resource: Resource; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-4 px-1">
      <div className="min-w-0">
        <Eyebrow tone="muted">{resourceTypeLabel(resource.type)}</Eyebrow>
        <p className="mt-1 font-display text-[1.375rem] leading-snug tracking-[-0.012em] text-balance">
          {resource.title}
        </p>
      </div>
      {children}
    </div>
  );
}

function VimeoPanel({ resource }: { resource: Resource }) {
  const url = resource.content;
  return (
    <Card>
      <div className="flex flex-col items-center px-8 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-ink">
          <WifiOffIcon className="h-7 w-7" />
        </div>
        <p className="mt-6 font-display text-[1.75rem] leading-tight tracking-[-0.015em]">
          Needs an internet connection
        </p>
        <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
          <span className="font-medium text-ink">{resource.title}</span> is streamed online and isn’t stored on this
          iPad, so it can’t be played offline.
        </p>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className={`mt-7 ${buttonClass("primary")}`}>
            Open in browser
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </Card>
  );
}

type WebKitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

function LocalVideoPanel({ resource }: { resource: Resource }) {
  const video = useRef<WebKitVideo>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(resource.asset);

  // Switching resource or leaving the skill unmounts the player. WebKit can
  // keep a detached video playing (and its file request open) until it's
  // collected, so stop it and drop the source on the way out.
  useEffect(() => {
    const v = video.current;
    return () => {
      if (!v) return;
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [src]);

  if (!src) return <MissingPanel />;

  // iOS's own full-screen player, entered directly. It works whatever the
  // page around the video looks like, unlike the inline control's element
  // full screen, which WebKit can fail to enter from inside styled layouts.
  // iOS refuses it until the video's metadata has loaded, so the button
  // waits for that.
  function enterFullScreen() {
    const v = video.current;
    if (!v || v.webkitDisplayingFullscreen || document.fullscreenElement) return;
    try {
      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      else void v.requestFullscreen().catch(() => {});
    } catch {
      void v.requestFullscreen?.().catch(() => {});
    }
  }

  if (failed) {
    return (
      <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="Can’t play this video">
        The video file couldn’t be read. Installing the latest content update may fix it.
      </EmptyState>
    );
  }

  return (
    <>
      {/* No clipping or transformed wrapper around the video: both interfere
          with WebKit's full-screen and control handling. */}
      <video
        ref={video}
        src={src}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={() => setReady(true)}
        onError={() => setFailed(true)}
        className="aspect-video w-full rounded-[1.5rem] bg-black shadow-raised"
        title={resource.title}
      >
        Your device can’t play this video.
      </video>
      <MediaLabel resource={resource}>
        <Button
          variant="tinted"
          icon={<ExpandIcon className="h-4 w-4" />}
          onClick={enterFullScreen}
          disabled={!ready}
        >
          Full screen
        </Button>
      </MediaLabel>
    </>
  );
}

function PdfPanel({ resource }: { resource: Resource }) {
  const src = assetUrl(resource.asset);
  if (!src) return <MissingPanel />;
  return (
    <Suspense
      fallback={
        <div className="flex h-[32rem] items-center justify-center text-ink-3" role="status">
          <Spinner className="h-7 w-7" />
          <span className="sr-only">Loading PDF</span>
        </div>
      }
    >
      <PdfViewer src={src} title={resource.title} />
    </Suspense>
  );
}

function ImagePanel({ resource }: { resource: Resource }) {
  const [expanded, setExpanded] = useState(false);
  const src = assetUrl(resource.asset);

  if (!src) return <MissingPanel />;

  return (
    <>
      <div className={`${STAGE} relative`}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`relative flex w-full cursor-zoom-in items-center justify-center ${STAGE_HEIGHT}`}
          aria-label={`View ${resource.title} full screen`}
        >
          <Ambient src={src} />
          <img src={src} alt={resource.title} className="relative max-h-full max-w-full object-contain drop-shadow-2xl" />
        </button>
        <span
          className="glass pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-3.5 text-[0.8125rem] font-medium"
          aria-hidden="true"
        >
          <ExpandIcon className="h-3.5 w-3.5" />
          Full screen
        </span>
      </div>
      <MediaLabel resource={resource} />
      {expanded && <Lightbox src={src} alt={resource.title} onClose={() => setExpanded(false)} />}
    </>
  );
}

const MAX_IMAGE_ZOOM = 5;

/** Full-screen image viewer: a modal dialog that holds focus while open and
 *  hands it back to whatever opened it. Pinch or double-tap to zoom, drag to
 *  look around; the keyboard's + − and 0 keys zoom too. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const close = useRef(onClose);

  // Zoom and pan, applied straight to the image's transform so gestures
  // don't re-render. Translation is in px from the centred position.
  useEffect(() => {
    const el = stage.current;
    const img = image.current;
    if (!el || !img) return;
    const view = { scale: 1, x: 0, y: 0 };
    const apply = (animate = false) => {
      img.style.transition = animate ? "transform 200ms ease-out" : "";
      img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    };
    /** Point relative to the stage centre, where the image's origin is. */
    const point = (t: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left - r.width / 2, y: t.clientY - r.top - r.height / 2 };
    };
    /** Zoom to `scale`, keeping the image point under `at` still. */
    const zoomTo = (scale: number, at = { x: 0, y: 0 }) => {
      const next = Math.min(MAX_IMAGE_ZOOM, Math.max(1, scale));
      view.x = next === 1 ? 0 : at.x - ((at.x - view.x) * next) / view.scale;
      view.y = next === 1 ? 0 : at.y - ((at.y - view.y) * next) / view.scale;
      view.scale = next;
      apply(true);
    };

    let pinch: { d0: number; s0: number; m0: { x: number; y: number }; x0: number; y0: number } | null = null;
    let pan: { start: { x: number; y: number }; x0: number; y0: number } | null = null;
    let lastTap = 0;
    let moved = false;

    const mid = (e: TouchEvent) => {
      const a = point(e.touches[0]);
      const b = point(e.touches[1]);
      return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    const onStart = (e: TouchEvent) => {
      moved = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        const { m, d } = mid(e);
        pinch = { d0: d, s0: view.scale, m0: m, x0: view.x, y0: view.y };
        pan = null;
      } else if (e.touches.length === 1 && view.scale > 1) {
        pan = { start: point(e.touches[0]), x0: view.x, y0: view.y };
      }
    };
    const onMove = (e: TouchEvent) => {
      moved = true;
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const { m, d } = mid(e);
        const scale = Math.min(MAX_IMAGE_ZOOM, Math.max(1, (pinch.s0 * d) / pinch.d0));
        view.x = m.x - ((pinch.m0.x - pinch.x0) * scale) / pinch.s0;
        view.y = m.y - ((pinch.m0.y - pinch.y0) * scale) / pinch.s0;
        view.scale = scale;
        apply();
      } else if (pan && e.touches.length === 1) {
        e.preventDefault();
        const p = point(e.touches[0]);
        view.x = pan.x0 + p.x - pan.start.x;
        view.y = pan.y0 + p.y - pan.start.y;
        apply();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        if (view.scale < 1.05) zoomTo(1);
        return;
      }
      if (e.touches.length === 0) pan = null;
      // Double-tap: close-up at the tap, or back to fit.
      if (!moved && e.changedTouches.length === 1 && e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTap < 320) {
          e.preventDefault();
          zoomTo(view.scale > 1.05 ? 1 : 2.5, point(e.changedTouches[0]));
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") zoomTo(view.scale * 1.25);
      else if (e.key === "-") zoomTo(view.scale / 1.25);
      else if (e.key === "0") zoomTo(1);
    };
    // WebKit's own pinch would zoom the whole app.
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      // The close button is the only control, so Tab stays on it.
      if (e.key === "Tab") {
        e.preventDefault();
        closeButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      ref={stage}
      className="fixed inset-0 z-50 flex animate-fade-in touch-none items-center justify-center overflow-hidden bg-black/90 p-6 backdrop-blur-2xl"
      // Tapping around the image closes it; taps on the image are for zooming.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <img ref={image} src={src} alt={alt} draggable={false} className="max-h-full max-w-full object-contain" />
      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Close full screen image"
        className="glass absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function StoryboardPanel({
  resource,
  practice,
  onPractice,
  step,
  onStep,
}: {
  resource: Resource;
  practice: PracticeProgress;
  onPractice: (progress: PracticeProgress) => void;
  step: number;
  onStep: (step: number) => void;
}) {
  const [frames, setFrames] = useState<ResolvedFrame[]>([]);
  const [practising, setPractising] = useState(false);
  const [loading, setLoading] = useState(true);
  const swipeStart = useRef<number | null>(null);
  const resourceId = resource.id;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const rawFrames = await listStoryboardFrames(resourceId);
      const resolved: ResolvedFrame[] = await Promise.all(
        rawFrames.map(async (f: StoryboardFrame) => {
          let src = assetUrl(f.asset);
          if (!src) {
            const media = await getMedia(Number(f.asset));
            if (media) src = assetUrl(media.asset);
          }
          return { position: f.position, src, alt: f.alt, caption: f.caption };
        })
      );

      if (!cancelled) {
        setFrames(resolved);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [resourceId]);

  // Warm the next frame so stepping forward shows it without a blank flash.
  useEffect(() => {
    const next = frames[step + 1];
    if (next?.src) new Image().src = next.src;
  }, [frames, step]);

  if (loading) {
    return (
      <div className={`${STAGE} ${STAGE_HEIGHT} flex items-center justify-center text-white/70`} role="status">
        <Spinner className="h-7 w-7" />
        <span className="sr-only">Loading storyboard</span>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <EmptyState outlined icon={<PhotoIcon className="h-7 w-7" />} title="No steps yet">
        This storyboard doesn’t have any frames in the installed content package.
      </EmptyState>
    );
  }

  const last = frames.length - 1;
  const index = Math.min(step, last);
  const frame = frames[index];
  const go = (i: number) => onStep(Math.min(Math.max(i, 0), last));
  const label = `Step ${index + 1} of ${frames.length}`;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={resource.title}
      onKeyDown={(e) => {
        // React bubbles events out of the practice portal; ignore those.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (e.key === "ArrowLeft") go(index - 1);
        else if (e.key === "ArrowRight") go(index + 1);
      }}
    >
      <div
        className={`${STAGE} relative touch-pan-y`}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") swipeStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipeStart.current === null) return;
          const dx = e.clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
        }}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={label}
          className={`relative flex items-center justify-center ${STAGE_HEIGHT}`}
        >
          {frame.src ? (
            <>
              <Ambient key={`ambient-${index}`} src={frame.src} />
              <img
                key={index}
                src={frame.src}
                alt={frame.alt || frame.caption || `${resource.title}, ${label.toLowerCase()}`}
                className="relative max-h-full max-w-full animate-fade-in object-contain drop-shadow-2xl"
                draggable={false}
              />
            </>
          ) : (
            <p className="text-[0.9375rem] text-white/70">Image not available</p>
          )}
        </div>
      </div>

      {/* Step progress: each segment jumps to its step. */}
      <ol className="mt-5 flex gap-1.5" aria-label="Steps">
        {frames.map((f, i) => (
          <li key={`${f.position}-${i}`} className="flex-1">
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={f.caption ? `Step ${i + 1}: ${f.caption}` : `Step ${i + 1}`}
              className="group flex h-11 w-full items-center rounded-md"
            >
              <span
                className={`h-1 w-full rounded-full transition-colors duration-300 ${
                  i < index ? "bg-accent/45" : i === index ? "bg-accent" : "bg-line-strong group-hover:bg-ink-3"
                }`}
              />
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-1 flex items-start gap-6 px-1">
        <div aria-hidden="true" className="shrink-0 pt-1">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-3">Step</p>
          <p className="mt-0.5 font-mono text-[1.75rem] font-light leading-none tabular-nums text-accent-ink">
            {pad(index + 1)}
            <span className="text-[0.9375rem] text-ink-3">/{pad(frames.length)}</span>
          </p>
        </div>

        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <p className="sr-only">{label}</p>
          <p
            key={index}
            className="animate-fade-in font-display text-[1.375rem] leading-snug tracking-[-0.01em] text-ink text-pretty sm:text-[1.5rem]"
          >
            {frame.caption || <span className="text-ink-3">No caption for this step.</span>}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <StepButton label="Previous step" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeftIcon className="h-5 w-5" />
          </StepButton>
          <StepButton label="Next step" disabled={index === last} onClick={() => go(index + 1)} primary>
            <ChevronRightIcon className="h-5 w-5" />
          </StepButton>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-[1.25rem] bg-surface p-4 pl-5 shadow-card ring-1 ring-line">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <ChecklistIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium text-ink">Practice mode</p>
          <p className="text-[0.875rem] text-ink-2">
            {practice.finishedAt !== null
              ? `All ${frames.length} steps done`
              : practice.startedAt !== null
                ? `${practice.done.length} of ${frames.length} steps done`
                : "Tick off each step as you perform it, with a timer."}
          </p>
        </div>
        <Button variant="tinted" onClick={() => setPractising(true)}>
          {practice.startedAt !== null && practice.finishedAt === null ? "Resume" : "Practise"}
        </Button>
      </div>

      {practising && (
        <PracticeMode
          title={resource.title}
          steps={frames}
          progress={practice}
          onChange={onPractice}
          onClose={() => setPractising(false)}
        />
      )}
    </section>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  primary,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition duration-150 active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
        primary
          ? "bg-accent text-on-accent shadow-sm hover:bg-accent-hover"
          : "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function MissingPanel() {
  return (
    <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="File not available">
      This resource’s file isn’t in the installed content package. Installing the latest content update may restore it.
    </EmptyState>
  );
}
