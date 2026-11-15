// The Content-Security-Policy for rendered pages. src/proxy.ts sends it with a
// fresh nonce on every request, and Next.js reads the nonce back out of the
// request's copy to stamp its own scripts and inline styles (see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
//
// Responses that aren't pages set their own policy: /files sends the SVG
// lockdown and frame-ancestors from lib/file-response.ts, and the offline API
// serves only data.

/** The only third-party content a page embeds: Vimeo's player, in an iframe. */
export const VIMEO_PLAYER_ORIGIN = "https://player.vimeo.com";

export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced framework scripts load the route chunks.
    // In development React needs eval to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Development injects unnonced <style> tags for hot reloading.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // PDFs open in an iframe from /files; videos in Vimeo's player.
    `frame-src 'self' ${VIMEO_PLAYER_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];
  return directives.join("; ");
}

/** A per-request nonce: 128 random bits, base64. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}
