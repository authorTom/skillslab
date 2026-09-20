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

export function getLastEtag(): string {
  return get("last_etag");
}

export function setLastEtag(etag: string): void {
  set("last_etag", etag);
}
