import { describe, it, expect } from "vitest";
import { releaseDefaultProblems } from "../scripts/release-defaults.mjs";

const KEY = Buffer.alloc(32, 1).toString("base64");

describe("release build defaults", () => {
  it("refuses a release build that wouldn't enforce signatures", () => {
    expect(releaseDefaultProblems({})).toEqual([expect.stringContaining("VITE_SIGNING_PUBLIC_KEY is not set")]);
  });

  it("allows it only with the explicit opt-out", () => {
    expect(releaseDefaultProblems({ SKILLSLAB_ALLOW_UNSIGNED_BUILD: "1" })).toEqual([]);
    expect(releaseDefaultProblems({ SKILLSLAB_ALLOW_UNSIGNED_BUILD: "true" })).toHaveLength(1);
  });

  it("accepts a real key and an https server", () => {
    expect(releaseDefaultProblems({ VITE_SIGNING_PUBLIC_KEY: KEY, VITE_SERVER_URL: "https://skillslab.trust.internal" })).toEqual([]);
  });

  it("rejects a malformed key or an http server, even with the opt-out", () => {
    expect(releaseDefaultProblems({ VITE_SIGNING_PUBLIC_KEY: "abc" })).toEqual([expect.stringContaining("32 bytes")]);
    expect(
      releaseDefaultProblems({ SKILLSLAB_ALLOW_UNSIGNED_BUILD: "1", VITE_SERVER_URL: "http://skillslab.trust.internal" })
    ).toEqual([expect.stringContaining("https://")]);
  });
});
