import { describe, it, expect } from "vitest";
import { mediaRef, parseMediaRef, mediaUrl } from "@/lib/media-refs";

describe("mediaRef", () => {
  it("formats a media reference", () => {
    expect(mediaRef(42)).toBe("media:42");
  });
});

describe("parseMediaRef", () => {
  it("parses a valid reference", () => {
    expect(parseMediaRef("media:42")).toBe(42);
  });

  it("returns null for non-reference content", () => {
    expect(parseMediaRef("https://vimeo.com/123")).toBeNull();
    expect(parseMediaRef("")).toBeNull();
    expect(parseMediaRef("media:")).toBeNull();
    expect(parseMediaRef("media:abc")).toBeNull();
    expect(parseMediaRef("media:0")).toBeNull();
    expect(parseMediaRef("media:-1")).toBeNull();
  });
});

describe("mediaUrl", () => {
  it("builds the public URL with encoded filename", () => {
    expect(mediaUrl(7, "my file.pdf")).toBe("/files/7/my%20file.pdf");
  });
});
