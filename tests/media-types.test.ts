import { describe, it, expect } from "vitest";
import { mediaKindFor, MIME_TYPES, MEDIA_EXTENSIONS } from "@/lib/media-types";

describe("mediaKindFor", () => {
  it("classifies image extensions", () => {
    expect(mediaKindFor(".jpg")).toBe("image");
    expect(mediaKindFor(".png")).toBe("image");
    expect(mediaKindFor(".svg")).toBe("image");
  });

  it("classifies pdf", () => {
    expect(mediaKindFor(".pdf")).toBe("pdf");
  });

  it("classifies video", () => {
    expect(mediaKindFor(".mp4")).toBe("video");
  });

  it("returns null for unknown extensions", () => {
    expect(mediaKindFor(".exe")).toBeNull();
    expect(mediaKindFor(".docx")).toBeNull();
  });
});

describe("MIME_TYPES", () => {
  it("includes video/mp4", () => {
    expect(MIME_TYPES[".mp4"]).toBe("video/mp4");
  });
});

describe("MEDIA_EXTENSIONS", () => {
  it("includes .mp4", () => {
    expect(MEDIA_EXTENSIONS).toContain(".mp4");
  });
});
