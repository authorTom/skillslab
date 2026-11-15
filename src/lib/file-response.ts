import fs from "fs";
import { Readable } from "stream";

// Serving files from disk, shared by /files and the offline release download
// route. Files are streamed rather than buffered (uploads run to 500 MB), and
// every type honours a single byte range, which is what browsers' video
// players and PDF viewers ask for.

/**
 * Locks down an SVG opened directly from the app origin. An Editor can upload
 * an SVG containing script; without this it would run with the privileges of
 * whoever opens it. `sandbox` gives the document an opaque origin and no
 * scripts. Inline styles stay, since plenty of illustration exports use them.
 */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** Only the app's own pages may frame a file (skill pages frame PDFs). */
const FRAME_ANCESTORS = "frame-ancestors 'self'";

/** Headers every served file gets, plus the SVG lockdown where it applies. */
export function securityHeaders(contentType: string): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    // No sandbox on PDFs: a sandboxed document can't run the browser's
    // built-in viewer.
    "Content-Security-Policy":
      contentType === "image/svg+xml" ? `${SVG_CSP}; ${FRAME_ANCESTORS}` : FRAME_ANCESTORS,
  };
}

export type ByteRange = { start: number; end: number };

/**
 * Parses a Range header against a file of `size` bytes.
 *
 * Returns the inclusive range to send, `null` when the header should be
 * ignored and the whole file sent (absent, not bytes, or several ranges, which
 * nothing here needs), or "unsatisfiable" for a 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, first, last] = match;
  if (first === "" && last === "") return null;

  if (first === "") {
    // Suffix range: the final N bytes.
    const length = Number(last);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(first);
  if (start >= size) return "unsatisfiable";
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}

/**
 * Streams `filePath` as the response body, as a 206 when the request asked for
 * a satisfiable range. `headers` are added to every response, including 416s.
 */
export function fileResponse(
  filePath: string,
  size: number,
  rangeHeader: string | null,
  headers: Record<string, string>
): Response {
  const range = parseRange(rangeHeader, size);
  const common = { ...headers, "Accept-Ranges": "bytes" };

  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "Content-Range": `bytes */${size}` },
    });
  }

  if (range) {
    return new Response(stream(filePath, range), {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  return new Response(size === 0 ? null : stream(filePath), {
    headers: { ...common, "Content-Length": String(size) },
  });
}

function stream(filePath: string, range?: ByteRange): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(filePath, range)) as ReadableStream<Uint8Array>;
}
