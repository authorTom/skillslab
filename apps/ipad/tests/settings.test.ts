// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

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
    // noop
  }
}

function getServerUrl(): string {
  return get("server_url");
}

function setServerUrl(url: string): void {
  set("server_url", url.replace(/\/+$/, ""));
}

describe("settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty string for unset values", () => {
    expect(getServerUrl()).toBe("");
  });

  it("stores and retrieves server URL", () => {
    setServerUrl("https://skills.example.nhs.uk");
    expect(getServerUrl()).toBe("https://skills.example.nhs.uk");
  });

  it("strips trailing slashes from server URL", () => {
    setServerUrl("https://skills.example.nhs.uk///");
    expect(getServerUrl()).toBe("https://skills.example.nhs.uk");
  });
});
