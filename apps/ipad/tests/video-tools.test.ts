import { describe, it, expect } from "vitest";
import { chapterAt, formatTimestamp, loopJump, NO_LOOP, parseChapters, pressLoop } from "../src/data/videoTools";

describe("parseChapters", () => {
  it("reads the release's JSON, in time order", () => {
    expect(parseChapters('[{"time":65,"title":"B"},{"time":0,"title":" A "}]')).toEqual([
      { time: 0, title: "A" },
      { time: 65, title: "B" },
    ]);
  });

  it("drops bad entries and survives bad or missing data", () => {
    expect(parseChapters('[{"time":-1,"title":"x"},{"time":5},{"time":"5","title":"y"},{"time":3,"title":"ok"}]')).toEqual([
      { time: 3, title: "ok" },
    ]);
    expect(parseChapters("not json")).toEqual([]);
    expect(parseChapters('{"time":1}')).toEqual([]);
    expect(parseChapters(undefined)).toEqual([]);
    expect(parseChapters("")).toEqual([]);
  });
});

describe("chapterAt and formatTimestamp", () => {
  it("finds the current chapter", () => {
    const chapters = [
      { time: 10, title: "A" },
      { time: 20, title: "B" },
    ];
    expect(chapterAt(chapters, 0)).toBe(-1);
    expect(chapterAt(chapters, 12)).toBe(0);
    expect(chapterAt(chapters, 20)).toBe(1);
  });

  it("formats times", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("A–B loop", () => {
  it("marks start, end, then clears", () => {
    const a = pressLoop(NO_LOOP, 12);
    const ab = pressLoop(a, 20);
    expect(ab).toEqual({ start: 12, end: 20 });
    expect(pressLoop(ab, 30)).toEqual(NO_LOOP);
  });

  it("swaps an end before the start and ignores a double tap", () => {
    expect(pressLoop({ start: 30, end: null }, 10)).toEqual({ start: 10, end: 30 });
    const a = { start: 30, end: null };
    expect(pressLoop(a, 30.1)).toBe(a);
  });

  it("jumps back at the end", () => {
    expect(loopJump({ start: 12, end: 20 }, 21)).toBe(12);
    expect(loopJump({ start: 12, end: 20 }, 15)).toBeNull();
    expect(loopJump({ start: 12, end: null }, 50)).toBeNull();
  });
});
