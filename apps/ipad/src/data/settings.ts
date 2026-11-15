const PREFIX = "skillslab_";

function get(key: string): string {
  try {
    return localStorage.getItem(`${PREFIX}${key}`) ?? "";
  } catch {
    return "";
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(`${PREFIX}${key}`, value);
  } catch {
    // Storage unavailable (private browsing, full, etc.)
  }
}

export function getServerUrl(): string {
  return get("server_url");
}

export function setServerUrl(url: string): void {
  set("server_url", url.replace(/\/+$/, ""));
}

export type ServerUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Checks a server address before it is saved, and normalises it (no trailing
 * slash). Content is only fetched over HTTPS; App Transport Security would
 * refuse anything else, with a far less helpful error. A local http address
 * is allowed in development builds, for running against `npm run dev`.
 */
export function checkServerUrl(input: string, allowLocalHttp = import.meta.env.DEV): ServerUrlCheck {
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter the server’s address." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return { ok: false, error: "Enter the full address, starting https:// (for example https://skillslab.trust.internal)." };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "That isn’t a valid web address." };
  }
  const localHttp =
    allowLocalHttp && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    return { ok: false, error: "The address must start with https://. SkillsLab only connects to its server securely." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, error: "Enter just the server’s address, without a username, ? or #." };
  }
  return { ok: true, url: `${url.origin}${url.pathname}`.replace(/\/+$/, "") };
}

export function getLastEtag(): string {
  return get("last_etag");
}

export function setLastEtag(etag: string): void {
  set("last_etag", etag);
}
