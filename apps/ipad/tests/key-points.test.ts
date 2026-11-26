import { describe, it, expect } from "vitest";
import { keyPointItems, keyPointSections } from "../src/data/keyPoints";

describe("key points", () => {
  it("lists only the fields with items, in order, with tones", () => {
    const sections = keyPointSections({ red_flags: "- Faints\n\n", equipment: "Gloves\nApron", indications: "" });
    expect(sections.map((s) => [s.key, s.tone, s.items])).toEqual([
      ["equipment", "plain", ["Gloves", "Apron"]],
      ["red_flags", "danger", ["Faints"]],
    ]);
  });

  it("has none for a release built before key points", () => {
    expect(keyPointSections({})).toEqual([]);
  });

  it("strips bullets but not hyphenated words", () => {
    expect(keyPointItems("• One\n2) Two\nNon-sterile")).toEqual(["One", "Two", "Non-sterile"]);
  });
});
