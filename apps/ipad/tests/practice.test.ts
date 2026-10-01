import { describe, it, expect } from "vitest";
import { formatElapsed, NO_PRACTICE, toggleStep } from "../src/components/PracticeMode";

describe("practice mode", () => {
  it("starts the timer on the first tick", () => {
    const p = toggleStep(NO_PRACTICE, 1, 3, 1000);
    expect(p).toEqual({ done: [1], startedAt: 1000, finishedAt: null });
  });

  it("stops the timer when every step is done", () => {
    let p = toggleStep(NO_PRACTICE, 0, 2, 1000);
    p = toggleStep(p, 1, 2, 5000);
    expect(p).toEqual({ done: [0, 1], startedAt: 1000, finishedAt: 5000 });
  });

  it("restarts the clock if a finished step is unticked", () => {
    let p = toggleStep(NO_PRACTICE, 0, 1, 1000);
    expect(p.finishedAt).toBe(1000);
    p = toggleStep(p, 0, 1, 2000);
    expect(p).toEqual({ done: [], startedAt: 1000, finishedAt: null });
  });

  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-50)).toBe("0:00");
  });
});
