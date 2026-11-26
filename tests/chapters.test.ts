import { describe, it, expect } from "vitest";
import { chapterAt, chaptersOf, formatTimestamp, parseChapters, serialiseChapters } from "@/lib/chapters";

describe("parseChapters", () => {
  it("reads times and names, in time order", () => {
    const parsed = parseChapters("1:30 Apply the tourniquet\n0:00 Introduction\n\n0:45 - Gather equipment");
    expect(parsed).toEqual({
      ok: true,
      chapters: [
        { time: 0, title: "Introduction" },
        { time: 45, title: "Gather equipment" },
        { time: 90, title: "Apply the tourniquet" },
      ],
    });
  });

  it("accepts hours and a range of separators", () => {
    const parsed = parseChapters("1:02:05 – Late step\n12:00: Middle");
    expect(parsed.ok && parsed.chapters).toEqual([
      { time: 720, title: "Middle" },
      { time: 3725, title: "Late step" },
    ]);
  });

  it("says which line is wrong", () => {
    expect(parseChapters("0:00 Start\nabout a minute in: next")).toEqual({
      ok: false,
      error: expect.stringContaining("Line 2"),
    });
    expect(parseChapters("0:75 Bad seconds").ok).toBe(false);
    expect(parseChapters("0:10").ok).toBe(false);
  });

  it("treats empty text as no chapters", () => {
    expect(parseChapters("  \n")).toEqual({ ok: true, chapters: [] });
    expect(chaptersOf(null)).toEqual([]);
    expect(chaptersOf("not a chapter")).toEqual([]);
  });

  it("round-trips through the stored form", () => {
    const text = serialiseChapters([
      { time: 5, title: "One" },
      { time: 3725, title: "Two" },
    ]);
    expect(text).toBe("0:05 One\n1:02:05 Two");
    expect(chaptersOf(text)).toHaveLength(2);
  });
});

describe("chapterAt", () => {
  const chapters = [
    { time: 10, title: "A" },
    { time: 20, title: "B" },
  ];
  it("finds the chapter playing", () => {
    expect(chapterAt(chapters, 5)).toBe(-1);
    expect(chapterAt(chapters, 10)).toBe(0);
    expect(chapterAt(chapters, 19.9)).toBe(0);
    expect(chapterAt(chapters, 25)).toBe(1);
  });
});

describe("formatTimestamp", () => {
  it("pads minutes and seconds", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65.9)).toBe("1:05");
    expect(formatTimestamp(3600)).toBe("1:00:00");
  });
});
