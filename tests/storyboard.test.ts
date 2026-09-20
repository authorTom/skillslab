import { describe, it, expect } from "vitest";
import { parseStoryboardFrames, serialiseStoryboardFrames } from "@/lib/storyboard";

describe("parseStoryboardFrames", () => {
  it("parses valid frames", () => {
    const input = JSON.stringify([
      { media_id: 1, caption: "Step one" },
      { media_id: 2, caption: "Step two" },
    ]);
    const frames = parseStoryboardFrames(input);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ media_id: 1, caption: "Step one" });
  });

  it("filters out frames with invalid media_id", () => {
    const input = JSON.stringify([
      { media_id: 1, caption: "ok" },
      { media_id: 0, caption: "zero" },
      { media_id: -1, caption: "negative" },
    ]);
    expect(parseStoryboardFrames(input)).toHaveLength(1);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseStoryboardFrames("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseStoryboardFrames('{"key": "value"}')).toEqual([]);
  });
});

describe("serialiseStoryboardFrames", () => {
  it("round-trips through parse", () => {
    const frames = [
      { media_id: 1, caption: "A" },
      { media_id: 2, caption: "B" },
    ];
    const result = parseStoryboardFrames(serialiseStoryboardFrames(frames));
    expect(result).toEqual(frames);
  });
});
