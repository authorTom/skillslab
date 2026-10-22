/** "just now", "5 minutes ago", "3 days ago" — relative, so the server's time zone doesn't matter. */
export function timeAgo(ms: number | null, now = Date.now()): string {
  if (ms === null) return "never";
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [60, "hour"],
    [24, "day"],
    [30, "month"],
    [12, "year"],
  ];
  let value = seconds / 60;
  let unit = "minute";
  for (let i = 1; i < units.length && value >= units[i][0]; i++) {
    value /= units[i][0];
    unit = units[i][1];
  }
  const whole = Math.floor(value);
  return `${whole} ${unit}${whole === 1 ? "" : "s"} ago`;
}

/** An exact UTC timestamp, for tooltips and the audit log. */
export function utcStamp(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** "Safari on iPad" from a user-agent string, roughly. */
export function describeBrowser(userAgent: string): string {
  if (!userAgent) return "Unknown browser";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const device = /iPad/.test(userAgent)
    ? "iPad"
    : /iPhone/.test(userAgent)
      ? "iPhone"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "";
  return device ? `${browser} on ${device}` : browser;
}
