// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { checkServerUrl, getServerUrl, setServerUrl } from "@/data/settings";

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

describe("checkServerUrl", () => {
  it("accepts an https address, normalised", () => {
    expect(checkServerUrl("  https://skillslab.trust.internal/  ", false)).toEqual({
      ok: true,
      url: "https://skillslab.trust.internal",
    });
    expect(checkServerUrl("https://intranet.example:8443/skillslab/", false)).toEqual({
      ok: true,
      url: "https://intranet.example:8443/skillslab",
    });
  });

  it("refuses plain http with a clear message", () => {
    const result = checkServerUrl("http://skillslab.trust.internal", false);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("https://") });
  });

  it("asks for the scheme when it's missing", () => {
    expect(checkServerUrl("skillslab.trust.internal", false)).toMatchObject({
      ok: false,
      error: expect.stringContaining("starting https://"),
    });
  });

  it("refuses empty, malformed and decorated addresses", () => {
    expect(checkServerUrl("", false).ok).toBe(false);
    expect(checkServerUrl("https://", false).ok).toBe(false);
    expect(checkServerUrl("https://user:pw@host", false).ok).toBe(false);
    expect(checkServerUrl("https://host/?x=1", false).ok).toBe(false);
    expect(checkServerUrl("ftp://host", false).ok).toBe(false);
  });

  it("allows a local http server only in development", () => {
    expect(checkServerUrl("http://localhost:3000", true)).toEqual({ ok: true, url: "http://localhost:3000" });
    expect(checkServerUrl("http://localhost:3000", false).ok).toBe(false);
    expect(checkServerUrl("http://192.168.1.10:3000", true).ok).toBe(false);
  });
});
