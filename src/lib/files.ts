// Display helpers for file sizes. Uploads themselves live in the media
// library — see media.ts, which owns everything that touches the filesystem.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** "1200 × 800" for an image whose dimensions are known. */
export function formatDimensions(width: number | null, height: number | null): string {
  return width && height ? `${width} × ${height}` : "";
}
