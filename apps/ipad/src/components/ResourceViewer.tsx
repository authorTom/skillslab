import { useEffect, useId, useRef, useState } from "react";
import type { Resource, StoryboardFrame } from "@/data/types";
import { assetUrl } from "@/data/assets";
import { listStoryboardFrames, getMedia } from "@/data/catalogue";
import Card from "./Card";
import { buttonClass } from "./Button";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import ResourceIcon, { resourceTypeLabel } from "./ResourceIcon";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  ExpandIcon,
  ExternalLinkIcon,
  PhotoIcon,
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
}

export default function ResourceViewer({ resources }: ResourceViewerProps) {
  const [activeId, setActiveId] = useState(resources[0]?.id);
  const active = resources.find((r) => r.id === activeId) ?? resources[0];
  const tabs = useRef(new Map<number, HTMLButtonElement>());
  const baseId = useId();
  const tabId = (id: number) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  if (!active) return null;

  // WAI-ARIA tabs pattern: arrow keys move between resources (the list is
  // horizontal in portrait and vertical in landscape, so accept both axes).
  function handleKeyDown(e: React.KeyboardEvent) {
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-3 hidden px-3 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-3 lg:block">
          Resources
        </h2>
        <div
          role="tablist"
          aria-label="Resources"
          onKeyDown={handleKeyDown}
          className="-mx-5 flex gap-2 overflow-x-auto px-5 py-1 scrollbar-none sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0"
        >
          {resources.map((resource) => {
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
                className={`flex min-h-14 shrink-0 items-center gap-3 rounded-xl py-2 pl-2 pr-4 text-left transition duration-150 active:scale-[0.98] lg:w-full ${
                  isActive
                    ? "bg-accent-soft text-accent-ink"
                    : "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2 lg:bg-transparent lg:ring-0"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.65rem] transition ${
                    isActive ? "bg-accent text-on-accent shadow-sm" : "bg-surface-2 text-ink-2 lg:bg-surface lg:ring-1 lg:ring-line"
                  }`}
                >
                  <ResourceIcon type={resource.type} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 max-w-[15rem] lg:max-w-none">
                  <span className={`block truncate text-[0.9375rem] leading-snug ${isActive ? "font-semibold" : "font-medium"}`}>
                    {resource.title}
                  </span>
                  <span className={`block text-[0.8125rem] ${isActive ? "text-accent-ink" : "text-ink-3"}`}>
                    {resourceTypeLabel(resource.type)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active.id)} className="min-w-0">
        <ResourcePanel key={active.id} resource={active} />
      </div>
    </div>
  );
}

function ResourcePanel({ resource }: { resource: Resource }) {
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
      return <StoryboardPanel resource={resource} />;
    default:
      return (
        <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="Can’t open this resource">
          This version of the app doesn’t support this type of resource.
        </EmptyState>
      );
  }
}

const STAGE = "overflow-hidden rounded-2xl bg-stage shadow-raised ring-1 ring-black/5";

function VimeoPanel({ resource }: { resource: Resource }) {
  const url = resource.content;
  return (
    <Card>
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-ink">
          <WifiOffIcon className="h-7 w-7" />
        </div>
        <p className="mt-5 text-lg font-semibold tracking-tight">Needs an internet connection</p>
        <p className="mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
          This video is streamed online and isn’t stored on this iPad, so it can’t be played offline.
        </p>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className={`mt-6 ${buttonClass("primary")}`}>
            Open in browser
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </Card>
  );
}

function LocalVideoPanel({ resource }: { resource: Resource }) {
  const src = assetUrl(resource.asset);
  if (!src) return <MissingPanel />;

  return (
    <div className={`${STAGE} aspect-video`}>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full"
        title={resource.title}
      >
        Your device can’t play this video.
      </video>
    </div>
  );
}

function PdfPanel({ resource }: { resource: Resource }) {
  const src = assetUrl(resource.asset);
  if (!src) return <MissingPanel />;

  return (
    <Card>
      <iframe src={src} className="h-[calc(100dvh-14rem)] min-h-[32rem] w-full bg-white" title={resource.title} />
    </Card>
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
          className="flex h-[clamp(18rem,calc(100dvh-20rem),42rem)] w-full cursor-zoom-in items-center justify-center"
          aria-label={`View ${resource.title} full screen`}
        >
          <img src={src} alt={resource.title} className="max-h-full max-w-full object-contain" />
        </button>
        <span
          className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/55 py-1.5 pl-2.5 pr-3 text-[0.8125rem] font-semibold text-white backdrop-blur-md"
          aria-hidden="true"
        >
          <ExpandIcon className="h-3.5 w-3.5" />
          Full screen
        </span>
      </div>
      {expanded && <Lightbox src={src} alt={resource.title} onClose={() => setExpanded(false)} />}
    </>
  );
}

/** Full-screen image viewer: a modal dialog that holds focus while open and
 *  hands it back to whatever opened it. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);

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
      className="fixed inset-0 z-50 flex animate-fade-in cursor-zoom-out items-center justify-center bg-black/90 p-6 backdrop-blur-2xl"
      onClick={onClose}
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Close full screen image"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition active:bg-white/25"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function StoryboardPanel({ resource }: { resource: Resource }) {
  const [frames, setFrames] = useState<ResolvedFrame[]>([]);
  const [index, setIndex] = useState(0);
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
    const next = frames[index + 1];
    if (next?.src) new Image().src = next.src;
  }, [frames, index]);

  if (loading) {
    return (
      <>
        <div className={`${STAGE} flex h-[clamp(18rem,calc(100dvh-26rem),36rem)] items-center justify-center text-white/70`} role="status">
          <Spinner className="h-7 w-7" />
          <span className="sr-only">Loading storyboard</span>
        </div>
      </>
    );
  }

  if (frames.length === 0) {
    return (
      <>
        <EmptyState outlined icon={<PhotoIcon className="h-7 w-7" />} title="No steps yet">
          This storyboard doesn’t have any frames in the installed content package.
        </EmptyState>
      </>
    );
  }

  const frame = frames[index];
  const last = frames.length - 1;
  const go = (i: number) => setIndex(Math.min(Math.max(i, 0), last));
  const label = `Step ${index + 1} of ${frames.length}`;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={resource.title}
      onKeyDown={(e) => {
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
          className="flex h-[clamp(18rem,calc(100dvh-26rem),36rem)] items-center justify-center"
        >
          {frame.src ? (
            <img
              key={index}
              src={frame.src}
              alt={frame.alt || frame.caption || `${resource.title}, ${label.toLowerCase()}`}
              className="max-h-full max-w-full animate-fade-in object-contain"
              draggable={false}
            />
          ) : (
            <p className="text-[0.9375rem] text-white/70">Image not available</p>
          )}
        </div>

        <span className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[0.8125rem] font-semibold tabular-nums text-white backdrop-blur-md" aria-hidden="true">
          {index + 1} / {frames.length}
        </span>

        <StageArrow side="left" label="Previous step" hidden={index === 0} onClick={() => go(index - 1)} />
        <StageArrow side="right" label="Next step" hidden={index === last} onClick={() => go(index + 1)} />
      </div>

      <div className="mt-5 flex items-start gap-4" aria-live="polite" aria-atomic="true">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[0.9375rem] font-semibold tabular-nums text-on-accent" aria-hidden="true">
          {index + 1}
        </span>
        <div className="min-w-0 pt-1">
          <p className="sr-only">{label}</p>
          <p className="text-[1.0625rem] leading-relaxed text-ink text-pretty">
            {frame.caption || <span className="text-ink-3">No caption for this step.</span>}
          </p>
        </div>
      </div>

      <ol className="-mx-1 mt-5 flex gap-2.5 overflow-x-auto px-1 py-1.5 scrollbar-none" aria-label="All steps">
        {frames.map((f, i) => (
          <li key={`${f.position}-${i}`} className="shrink-0">
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={f.caption ? `Step ${i + 1}: ${f.caption}` : `Step ${i + 1}`}
              className={`relative block h-16 w-24 overflow-hidden rounded-lg bg-surface-2 transition duration-150 active:scale-95 ${
                i === index
                  ? "ring-[3px] ring-accent ring-offset-2 ring-offset-canvas"
                  : "opacity-70 ring-1 ring-line hover:opacity-100"
              }`}
            >
              {f.src && <img src={f.src} alt="" className="h-full w-full object-cover" draggable={false} />}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[0.6875rem] font-semibold tabular-nums leading-4 text-white">
                {i + 1}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageArrow({
  side,
  label,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={hidden}
      className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition duration-200 active:scale-90 active:bg-black/65 disabled:pointer-events-none disabled:opacity-0 ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      {side === "left" ? <ChevronLeftIcon className="h-6 w-6" /> : <ChevronRightIcon className="h-6 w-6" />}
    </button>
  );
}

function MissingPanel() {
  return (
    <>
      <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="File not available">
        This resource’s file isn’t in the installed content package. Installing the latest content update may restore it.
      </EmptyState>
    </>
  );
}
