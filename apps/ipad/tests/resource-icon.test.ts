import { describe, it, expect } from "vitest";

const LABELS: Record<string, string> = {
  video: "Video (online)",
  local_video: "Video",
  pdf: "PDF",
  image: "Image",
  storyboard: "Storyboard",
};

function resourceTypeLabel(type: string): string {
  return LABELS[type] ?? type;
}

describe("resourceTypeLabel", () => {
  it("returns correct label for each known type", () => {
    expect(resourceTypeLabel("video")).toBe("Video (online)");
    expect(resourceTypeLabel("local_video")).toBe("Video");
    expect(resourceTypeLabel("pdf")).toBe("PDF");
    expect(resourceTypeLabel("image")).toBe("Image");
    expect(resourceTypeLabel("storyboard")).toBe("Storyboard");
  });

  it("returns the raw type for unknown types", () => {
    expect(resourceTypeLabel("audio")).toBe("audio");
    expect(resourceTypeLabel("unknown")).toBe("unknown");
  });
});
