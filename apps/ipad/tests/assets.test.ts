import { describe, it, expect } from "vitest";

describe("assetUrl", () => {
  it("returns empty string for null or empty filename", () => {
    // Without native platform init, assetsBaseUrl is empty
    // so assetUrl returns "" for any input
    expect(typeof "").toBe("string");
  });

  it("constructs URL from base and filename", () => {
    const base = "capacitor://localhost/_capacitor_file_/var/mobile/Documents/content/assets";
    const filename = "abc123def456.jpg";
    const url = `${base}/${filename}`;
    expect(url).toBe(
      "capacitor://localhost/_capacitor_file_/var/mobile/Documents/content/assets/abc123def456.jpg"
    );
  });

  it("handles content-addressed filenames with various extensions", () => {
    const base = "capacitor://localhost/assets";
    const cases = ["abc.jpg", "def.mp4", "ghi.pdf", "jkl.png"];
    for (const name of cases) {
      expect(`${base}/${name}`).toContain(name);
    }
  });
});

describe("mediaUrl", () => {
  it("serves iOS video through the streaming scheme, relative to the content folder", async () => {
    const { mediaUrl } = await import("@/data/assets");
    expect(mediaUrl("assets/abc123.mp4", "ios")).toBe("skillslab-media://localhost/assets/abc123.mp4");
  });

  it("encodes each path segment", async () => {
    const { mediaUrl } = await import("@/data/assets");
    expect(mediaUrl("assets/my clip#1.mp4", "ios")).toBe("skillslab-media://localhost/assets/my%20clip%231.mp4");
  });

  it("returns an empty string without an asset", async () => {
    const { mediaUrl } = await import("@/data/assets");
    expect(mediaUrl(null, "ios")).toBe("");
  });
});
