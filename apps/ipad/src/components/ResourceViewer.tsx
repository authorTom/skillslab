import { useEffect, useState } from "react";
import type { Resource, StoryboardFrame } from "@/data/types";
import { assetUrl } from "@/data/assets";
import { listStoryboardFrames, getMedia } from "@/data/catalogue";
import Card from "./Card";
import ResourceIcon, { resourceTypeLabel } from "./ResourceIcon";

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

  if (!active) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Resources" className="lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
          Resources
        </h2>
        <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {resources.map((resource) => {
            const isActive = resource.id === active.id;
            return (
              <li key={resource.id} className="shrink-0 lg:shrink">
                <button
                  onClick={() => setActiveId(resource.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                      : "border-stone-200 bg-white text-stone-700 hover:border-teal-300"
                  }`}
                >
                  <ResourceIcon
                    type={resource.type}
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-teal-100" : "text-stone-400"}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{resource.title}</span>
                    <span className={`text-xs ${isActive ? "text-teal-100" : "text-stone-400"}`}>
                      {resourceTypeLabel(resource.type)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-live="polite" className="min-w-0">
        <ResourcePanel key={active.id} resource={active} />
      </section>
    </div>
  );
}

function ResourcePanel({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case "video":
      return <VimeoPanel url={resource.content} />;
    case "local_video":
      return <LocalVideoPanel asset={resource.asset} title={resource.title} />;
    case "pdf":
      return <PdfPanel asset={resource.asset} title={resource.title} />;
    case "image":
      return <ImagePanel asset={resource.asset} alt={resource.title} />;
    case "storyboard":
      return <StoryboardPanel resourceId={resource.id} title={resource.title} />;
    default:
      return (
        <Card>
          <p className="p-8 text-sm text-stone-500">Unsupported resource type.</p>
        </Card>
      );
  }
}

function VimeoPanel({ url }: { url: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <svg className="h-12 w-12 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12Z" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div>
          <p className="font-medium text-stone-600">Online video</p>
          <p className="mt-1 text-sm text-stone-400">
            This video requires an internet connection and is not available offline.
          </p>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
          >
            Open in browser
          </a>
        )}
      </div>
    </Card>
  );
}

function LocalVideoPanel({ asset, title }: { asset: string | null; title: string }) {
  const src = assetUrl(asset);
  if (!src) return <MissingPanel />;

  return (
    <Card>
      <div className="aspect-video bg-black">
        <video
          src={src}
          controls
          playsInline
          className="h-full w-full"
          title={title}
        >
          Your browser does not support the video element.
        </video>
      </div>
    </Card>
  );
}

function PdfPanel({ asset, title }: { asset: string | null; title: string }) {
  const src = assetUrl(asset);
  if (!src) return <MissingPanel />;

  return (
    <Card>
      <iframe src={src} className="h-[75vh] w-full" title={title} />
    </Card>
  );
}

function ImagePanel({ asset, alt }: { asset: string | null; alt: string }) {
  const [expanded, setExpanded] = useState(false);
  const src = assetUrl(asset);
  if (!src) return <MissingPanel />;

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <Card>
        <button
          onClick={() => setExpanded(true)}
          className="block w-full cursor-zoom-in bg-stone-100"
          aria-label={`Expand image: ${alt}`}
        >
          <img src={src} alt={alt} className="mx-auto max-h-[70vh] w-auto max-w-full" />
        </button>
      </Card>
      <p className="mt-3 text-sm text-stone-400">Tap the image to view full screen.</p>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-stone-950/90 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal
        >
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function StoryboardPanel({ resourceId, title }: { resourceId: number; title: string }) {
  const [frames, setFrames] = useState<ResolvedFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
        </div>
      </Card>
    );
  }

  if (frames.length === 0) {
    return (
      <Card>
        <p className="p-8 text-sm text-stone-500">This storyboard has no frames yet.</p>
      </Card>
    );
  }

  return (
    <div>
      <Card>
        <div className="bg-stone-100">
          <img
            src={frames[index].src}
            alt={frames[index].alt || frames[index].caption || `${title}, frame ${index + 1} of ${frames.length}`}
            className="mx-auto max-h-[65vh] w-auto max-w-full"
          />
        </div>
        {frames[index].caption && (
          <p className="border-t border-stone-200 bg-stone-50 px-5 py-3 text-sm text-stone-600">
            <span className="mr-2 font-semibold text-stone-400">Step {index + 1}</span>
            {frames[index].caption}
          </p>
        )}
        <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
          <button
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            className="rounded-lg border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm tabular-nums text-stone-500">
            {index + 1} / {frames.length}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(i + 1, frames.length - 1))}
            disabled={index === frames.length - 1}
            className="rounded-lg border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </Card>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {frames.map((frame, i) => (
          <button
            key={`${frame.position}-${i}`}
            onClick={() => setIndex(i)}
            title={frame.caption || undefined}
            className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
              i === index ? "border-teal-600" : "border-transparent opacity-60 hover:opacity-100"
            }`}
            aria-label={frame.caption ? `Step ${i + 1}: ${frame.caption}` : `Go to frame ${i + 1}`}
          >
            <img src={frame.src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MissingPanel() {
  return (
    <Card>
      <p className="p-8 text-sm text-stone-500">
        This resource's file is no longer available.
      </p>
    </Card>
  );
}
