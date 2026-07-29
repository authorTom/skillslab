// How courses point at library files. Kept free of database and filesystem
// imports so client components can use it too.

/** Prefix of a resource's content when it points at a media item. */
const PREFIX = "media:";

export function mediaRef(id: number): string {
  return `${PREFIX}${id}`;
}

/** The media id a resource's content points at, or null if it isn't a ref. */
export function parseMediaRef(content: string): number | null {
  if (!content.startsWith(PREFIX)) return null;
  const id = Number(content.slice(PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Public URL for a library file. The id is what resolves it — the filename is
 * cosmetic, so renaming a file can never break a link that is already out there.
 */
export function mediaUrl(id: number, filename: string): string {
  return `/files/${id}/${encodeURIComponent(filename)}`;
}
