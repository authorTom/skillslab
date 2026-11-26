import { describe, it, expect } from "vitest";
import { loopJump, NO_LOOP, pressLoop } from "@/lib/video-tools";

describe("A–B loop", () => {
  it("marks start, then end, then clears", () => {
    const a = pressLoop(NO_LOOP, 12);
    expect(a).toEqual({ start: 12, end: null });
    const ab = pressLoop(a, 20);
    expect(ab).toEqual({ start: 12, end: 20 });
    expect(pressLoop(ab, 25)).toEqual(NO_LOOP);
  });

  it("swaps an end marked before the start", () => {
    expect(pressLoop({ start: 30, end: null }, 10)).toEqual({ start: 10, end: 30 });
  });

  it("ignores a second tap too close to the first", () => {
    const a = { start: 12, end: null };
    expect(pressLoop(a, 12.2)).toBe(a);
  });

  it("jumps back to the start only at the end of a complete loop", () => {
    expect(loopJump({ start: 12, end: 20 }, 19.9)).toBeNull();
    expect(loopJump({ start: 12, end: 20 }, 20)).toBe(12);
    expect(loopJump({ start: 12, end: null }, 40)).toBeNull();
    expect(loopJump(NO_LOOP, 40)).toBeNull();
  });
});
