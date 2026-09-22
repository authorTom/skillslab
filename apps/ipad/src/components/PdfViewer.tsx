import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import { DocumentIcon } from "./icons";

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEP = 1.25;
/** Page padding and gap at 100% (CSS px); both scale with zoom so the whole
 *  layout is linear in zoom, which keeps pinch maths simple. */
const PAD = 16;
/** Cap on a page canvas's pixel count. iPadOS WebKit limits canvas memory,
 *  so at extreme zoom a page is upscaled slightly rather than failing. */
const MAX_CANVAS_PIXELS = 8_000_000;

interface PageSize {
  width: number;
  height: number;
}

const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Renders a PDF with pdf.js so it can be pinch-zoomed inside the app. The
 * iOS web view shows a PDF in an iframe as a static image of its first page,
 * without zoom. Pages render lazily as they scroll into view, and re-render
 * sharply after each zoom; a transparent text layer keeps the text readable
 * by VoiceOver.
 */
export default function PdfViewer({ src, title }: { src: string; title: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewWidth, setViewWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  // Scroll position to apply once the layout reflects a new zoom.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const task = getDocument({ url: src });
    let cancelled = false;
    task.promise
      .then(async (pdf) => {
        const pageSizes: PageSize[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const viewport = (await pdf.getPage(i)).getViewport({ scale: 1 });
          pageSizes.push({ width: viewport.width, height: viewport.height });
        }
        if (!cancelled) {
          setSizes(pageSizes);
          setDoc(pdf);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [src]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  // Keep the point under the fingers (or the view centre) still across a zoom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pendingScroll.current) {
      el.scrollLeft = pendingScroll.current.left;
      el.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);

  /** Zoom to `next`, keeping the scroller point (x, y) fixed on screen. */
  const zoomAround = useCallback((next: number, x: number, y: number) => {
    const el = scroller.current;
    const from = zoomRef.current;
    const to = clamp(next);
    if (!el || to === from) return;
    const ratio = to / from;
    pendingScroll.current = {
      left: (el.scrollLeft + x) * ratio - x,
      top: (el.scrollTop + y) * ratio - y,
    };
    setZoom(to);
  }, []);

  const ready = doc !== null && viewWidth > 0;

  const zoomFromCentre = (next: number) => {
    const el = scroller.current;
    if (el) zoomAround(next, el.clientWidth / 2, el.clientHeight / 2);
  };

  // Pinch to zoom and double-tap, from raw touch events. The page itself must
  // not zoom, so two-finger gestures are cancelled here and the content is
  // scaled with a transform while the fingers move, then laid out and
  // re-rendered at the new zoom when they lift.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;

    let pinch: { d0: number; x0: number; y0: number; x: number; y: number; scale: number } | null = null;
    let lastTap = { time: 0, x: 0, y: 0 };
    let moved = false;

    const point = (t: Touch) => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };

    const onStart = (e: TouchEvent) => {
      moved = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        const a = point(e.touches[0]);
        const b = point(e.touches[1]);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), x0: x, y0: y, x, y, scale: 1 };
        inner.style.transformOrigin = `${el.scrollLeft + x}px ${el.scrollTop + y}px`;
      }
    };

    const onMove = (e: TouchEvent) => {
      moved = true;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const a = point(e.touches[0]);
      const b = point(e.touches[1]);
      const z = zoomRef.current;
      pinch.scale = clamp((z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0) / z;
      pinch.x = (a.x + b.x) / 2;
      pinch.y = (a.y + b.y) / 2;
      inner.style.transform = `translate(${pinch.x - pinch.x0}px, ${pinch.y - pinch.y0}px) scale(${pinch.scale})`;
    };

    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        const { scale, x0, y0, x, y } = pinch;
        pinch = null;
        inner.style.transform = "";
        const from = zoomRef.current;
        const to = clamp(from * scale);
        if (to !== from) {
          // The content point that started under (x0, y0) now sits under (x, y).
          pendingScroll.current = {
            left: (el.scrollLeft + x0) * (to / from) - x,
            top: (el.scrollTop + y0) * (to / from) - y,
          };
          setZoom(to);
        }
        return;
      }
      // Double-tap toggles between fit-width and a close-up at the tap.
      if (!moved && e.changedTouches.length === 1 && e.touches.length === 0) {
        const p = point(e.changedTouches[0]);
        const now = Date.now();
        if (now - lastTap.time < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          e.preventDefault();
          zoomAround(zoomRef.current > 1.05 ? 1 : 2.5, p.x, p.y);
          lastTap = { time: 0, x: 0, y: 0 };
        } else {
          lastTap = { time: now, x: p.x, y: p.y };
        }
      }
    };

    // WebKit's own pinch gesture would zoom the whole app.
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
    };
  }, [ready, zoomAround]);

  if (failed) {
    return (
      <EmptyState outlined icon={<DocumentIcon className="h-7 w-7" />} title="Can’t open this PDF">
        The file may be damaged. Installing the latest content update may fix it.
      </EmptyState>
    );
  }

  const pageWidth = Math.max(0, (viewWidth - PAD * 2) * zoom);
  const offsets: number[] = [];
  let y = PAD * zoom;
  for (const s of sizes) {
    offsets.push(y);
    y += (pageWidth * s.height) / s.width + PAD * zoom;
  }

  function handleScroll() {
    const el = scroller.current;
    if (!el || offsets.length === 0) return;
    const middle = el.scrollTop + el.clientHeight / 2;
    let page = 1;
    for (let i = 0; i < offsets.length; i++) if (offsets[i] <= middle) page = i + 1;
    setCurrentPage(page);
  }

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-surface-2 shadow-raised ring-1 ring-line">
      <div
        ref={scroller}
        tabIndex={0}
        role="document"
        aria-label={`${title}, PDF`}
        onScroll={handleScroll}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoomFromCentre(zoom * STEP);
          else if (e.key === "-") zoomFromCentre(zoom / STEP);
          else if (e.key === "0") zoomFromCentre(1);
        }}
        className="h-[calc(100dvh-20rem)] min-h-[32rem] touch-pan-x touch-pan-y overflow-auto overscroll-contain lg:h-[calc(100dvh-4rem)]"
      >
        {!ready ? (
          <div className="flex h-full items-center justify-center text-ink-3" role="status">
            <Spinner className="h-7 w-7" />
            <span className="sr-only">Loading PDF</span>
          </div>
        ) : (
          <div
            ref={content}
            className="relative"
            style={{ width: viewWidth * zoom, height: y }}
          >
            {sizes.map((s, i) => (
              <PdfPage
                key={i}
                doc={doc!}
                pageNumber={i + 1}
                pageCount={sizes.length}
                size={s}
                width={pageWidth}
                top={offsets[i]}
                left={PAD * zoom}
                root={scroller}
              />
            ))}
          </div>
        )}
      </div>

      {doc && (
        <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full !bg-black/75 p-1 font-mono text-[0.8125rem] tabular-nums">
          <ToolbarButton label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => zoomFromCentre(zoom / STEP)}>
            <path d="M5 12h14" />
          </ToolbarButton>
          <button
            type="button"
            onClick={() => zoomFromCentre(1)}
            aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to fit width`}
            className="min-h-11 min-w-16 rounded-full px-2 transition active:bg-white/15"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomFromCentre(zoom * STEP)}>
            <path d="M5 12h14M12 5v14" />
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/25" />
          <span className="px-3" aria-live="polite">
            <span className="sr-only">Page </span>
            {currentPage}
            <span className="opacity-60"> / {sizes.length}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 active:bg-white/15 disabled:opacity-35"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/**
 * One page: renders its canvas and text layer once it nears the viewport,
 * re-renders at the current zoom, and frees its canvas when far away.
 */
function PdfPage({
  doc,
  pageNumber,
  pageCount,
  size,
  width,
  top,
  left,
  root,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
  size: PageSize;
  width: number;
  top: number;
  left: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const height = (width * size.height) / size.width;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current,
      rootMargin: "100% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  // Canvas at the current zoom; the previous one stays visible until the new
  // one is ready, so zooming never flashes blank.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!near) {
      el.querySelectorAll("canvas").forEach((c) => {
        c.width = 0;
        c.remove();
      });
      return;
    }

    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    const timer = setTimeout(async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
      const viewport = page.getViewport({ scale: (width / size.width) * outputScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute("aria-hidden", "true");
      canvas.className = "absolute inset-0 h-full w-full";
      const render = page.render({ canvas, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      el.querySelectorAll("canvas").forEach((c) => {
        c.width = 0;
        c.remove();
      });
      el.prepend(canvas);
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [near, width, height, doc, pageNumber, size.width]);

  // Text layer, laid out once at scale 1; the --total-scale-factor variable
  // on the page resizes it with every zoom without re-rendering.
  useEffect(() => {
    const layer = textLayer.current;
    if (!near || !layer || layer.childElementCount > 0) return;
    let cancelled = false;
    let text: TextLayer | null = null;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      text = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport: page.getViewport({ scale: 1 }),
      });
      text.render().catch(() => {});
    });
    return () => {
      cancelled = true;
      text?.cancel();
    };
  }, [near, doc, pageNumber]);

  return (
    <div
      ref={box}
      role="group"
      aria-label={`Page ${pageNumber} of ${pageCount}`}
      className="absolute overflow-hidden rounded-sm bg-white shadow-card"
      style={
        {
          top,
          left,
          width,
          height,
          "--total-scale-factor": width / size.width,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      <div ref={textLayer} className="textLayer" />
    </div>
  );
}
