import { describe, it, expect } from "vitest";
import { hasKeyPoints, keyPointItems, keyPointsOf, normaliseKeyPoints, NO_KEY_POINTS } from "@/lib/key-points";

describe("key points", () => {
  it("splits lines and strips typed or pasted bullets", () => {
    expect(keyPointItems("- Gloves\n• Apron\n\n  3. Tourniquet  \n* Sharps bin\n1) Gauze")).toEqual([
      "Gloves",
      "Apron",
      "Tourniquet",
      "Sharps bin",
      "Gauze",
    ]);
  });

  it("keeps a hyphen that isn't a bullet", () => {
    expect(keyPointItems("Non-sterile gloves\n-5 °C")).toEqual(["Non-sterile gloves", "-5 °C"]);
  });

  it("normalises to one item per line", () => {
    expect(normaliseKeyPoints("  - A\r\n\r\n- B ")).toBe("A\nB");
  });

  it("fills in fields missing from older rows", () => {
    expect(keyPointsOf({ equipment: "Gloves" })).toEqual({ ...NO_KEY_POINTS, equipment: "Gloves" });
    expect(hasKeyPoints(keyPointsOf({}))).toBe(false);
    expect(hasKeyPoints(keyPointsOf({ red_flags: "\n Faints" }))).toBe(true);
  });
});
