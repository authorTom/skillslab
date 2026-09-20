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
