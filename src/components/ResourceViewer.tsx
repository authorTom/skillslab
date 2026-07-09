"use client";

import { useEffect, useState } from "react";
import type { Resource } from "@/lib/data";
import { ResourceIcon, RESOURCE_TYPE_LABELS } from "./ResourceIcon";

/** Turns a Vimeo URL (with optional privacy hash) into a player embed URL. */
function vimeoEmbedUrl(url: string): string | null {
  const match = url.match(
    /vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/
  );
  if (!match) return null;
  const [, id, hash] = match;
  return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
}

function parseFrames(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ResourceViewer({ resources }: { resources: Resource[] }) {
  const [activeId, setActiveId] = useState(resources[0]?.id);
  const active = resources.find((r) => r.id === activeId) ?? resources[0];

  if (!active) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
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
                      {RESOURCE_TYPE_LABELS[resource.type]}
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
      return <VideoPanel url={resource.content} />;
    case "pdf":
      return <PdfPanel src={resource.content} title={resource.title} />;
    case "image":
      return <ImagePanel src={resource.content} alt={resource.title} />;
    case "storyboard":
      return <StoryboardPanel frames={parseFrames(resource.content)} title={resource.title} />;
  }
}

function VideoPanel({ url }: { url: string }) {
  const embed = vimeoEmbedUrl(url);
  if (!embed) {
    return (
      <Card>
        <p className="p-8 text-sm text-stone-500">
          This video link couldn&apos;t be recognised as a Vimeo URL.{" "}
          <a href={url} className="text-teal-700 underline" target="_blank" rel="noreferrer">
            Open it directly
          </a>
          .
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="aspect-video">
        <iframe
          src={embed}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Vimeo video"
        />
      </div>
    </Card>
  );
}

function PdfPanel({ src, title }: { src: string; title: string }) {
  return (
    <div>
      <Card>
        <iframe src={src} className="h-[75vh] w-full" title={title} />
      </Card>
      <p className="mt-3 text-sm text-stone-400">
        Viewer not loading?{" "}
        <a href={src} target="_blank" rel="noreferrer" className="text-teal-700 underline">
          Open the PDF in a new tab
        </a>
        .
      </p>
    </div>
  );
}

function ImagePanel({ src, alt }: { src: string; alt: string }) {
  const [expanded, setExpanded] = useState(false);

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="mx-auto max-h-[70vh] w-auto max-w-full" />
        </button>
      </Card>
      <p className="mt-3 text-sm text-stone-400">Click the image to view full screen.</p>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-stone-950/90 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function StoryboardPanel({ frames, title }: { frames: string[]; title: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, frames.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames.length]);

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frames[index]}
            alt={`${title} — frame ${index + 1} of ${frames.length}`}
            className="mx-auto max-h-[65vh] w-auto max-w-full"
          />
        </div>
        <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
          <button
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            className="rounded-lg border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-40 disabled:hover:border-stone-200"
          >
            ← Previous
          </button>
          <span className="text-sm tabular-nums text-stone-500">
            {index + 1} / {frames.length}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(i + 1, frames.length - 1))}
            disabled={index === frames.length - 1}
            className="rounded-lg border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-40 disabled:hover:border-stone-200"
          >
            Next →
          </button>
        </div>
      </Card>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {frames.map((frame, i) => (
          <button
            key={frame + i}
            onClick={() => setIndex(i)}
            className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
              i === index ? "border-teal-600" : "border-transparent opacity-60 hover:opacity-100"
            }`}
            aria-label={`Go to frame ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {children}
    </div>
  );
}
