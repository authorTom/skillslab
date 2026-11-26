import { describe, it, expect, beforeEach } from "vitest";
import { hasSeenTutorial, markTutorialSeen, TUTORIAL_SLIDES } from "../src/data/tutorial";

describe("tutorial", () => {
  beforeEach(() => localStorage.clear());

  it("is shown until it has been seen", () => {
    expect(hasSeenTutorial()).toBe(false);
    markTutorialSeen();
    expect(hasSeenTutorial()).toBe(true);
  });

  it("covers the main features, each once", () => {
    const ids = TUTORIAL_SLIDES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["find", "skill", "video", "practice", "updates"]));
    for (const slide of TUTORIAL_SLIDES) {
      expect(slide.title).not.toBe("");
      expect(slide.tips.length).toBeGreaterThan(0);
    }
  });
});
