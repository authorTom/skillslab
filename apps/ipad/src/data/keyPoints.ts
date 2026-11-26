import type { Skill } from "./types";

/**
 * A skill's key points, in the order they're shown. Mirrors the web app's
 * src/lib/key-points.ts; the CMS stores each field one item per line.
 */
export const KEY_POINT_FIELDS = [
  { key: "indications", label: "Indications", tone: "plain" },
  { key: "contraindications", label: "Contraindications & cautions", tone: "caution" },
  { key: "equipment", label: "Equipment", tone: "plain" },
  { key: "red_flags", label: "Red flags: stop if…", tone: "danger" },
  { key: "common_errors", label: "Common errors", tone: "plain" },
] as const;

export type KeyPointKey = (typeof KEY_POINT_FIELDS)[number]["key"];
export type KeyPointTone = (typeof KEY_POINT_FIELDS)[number]["tone"];

export interface KeyPointSection {
  key: KeyPointKey;
  label: string;
  tone: KeyPointTone;
  items: string[];
}

/** One item per line, with any bullet in front removed. */
export function keyPointItems(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** The skill's non-empty key-point sections. None for releases built before
 *  key points existed. */
export function keyPointSections(skill: Partial<Pick<Skill, KeyPointKey>>): KeyPointSection[] {
  return KEY_POINT_FIELDS.map((field) => ({ ...field, items: keyPointItems(skill[field.key]) })).filter(
    (section) => section.items.length > 0
  );
}
