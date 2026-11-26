// Shared between server actions and client components — keep free of server-only imports.

/**
 * The structured "key points" on a course. Each is stored as plain text with
 * one item per line, so they stay easy to edit in a textarea and travel to
 * the iPad as-is.
 */
export const KEY_POINT_FIELDS = [
  {
    key: "indications",
    label: "Indications",
    hint: "When this skill is performed.",
  },
  {
    key: "contraindications",
    label: "Contraindications & cautions",
    hint: "When not to do it, or when to take extra care.",
  },
  {
    key: "equipment",
    label: "Equipment",
    hint: "What to gather first. Also shown at the start of practice mode on the iPad.",
  },
  {
    key: "red_flags",
    label: "Red flags: stop if…",
    hint: "Findings that mean stopping and escalating.",
  },
  {
    key: "common_errors",
    label: "Common errors",
    hint: "Mistakes learners often make.",
  },
] as const;

export type KeyPointKey = (typeof KEY_POINT_FIELDS)[number]["key"];

export type KeyPoints = Record<KeyPointKey, string>;

export const KEY_POINT_KEYS: KeyPointKey[] = KEY_POINT_FIELDS.map((f) => f.key);

export const NO_KEY_POINTS: KeyPoints = {
  indications: "",
  contraindications: "",
  equipment: "",
  red_flags: "",
  common_errors: "",
};

/** The items in a key-point field: one per line, with any bullet typed or
 *  pasted in front of it removed. */
export function keyPointItems(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** The text stored for a field: its items, one per line. */
export function normaliseKeyPoints(text: string): string {
  return keyPointItems(text).join("\n");
}

/** The key points of a row that may come from before they existed. */
export function keyPointsOf(row: Partial<Record<KeyPointKey, string | null>>): KeyPoints {
  const points = { ...NO_KEY_POINTS };
  for (const key of KEY_POINT_KEYS) points[key] = row[key] ?? "";
  return points;
}

export function hasKeyPoints(points: KeyPoints): boolean {
  return KEY_POINT_KEYS.some((key) => keyPointItems(points[key]).length > 0);
}
