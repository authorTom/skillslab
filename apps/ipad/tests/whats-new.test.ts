import { describe, it, expect, vi } from "vitest";
import type { Resource, Skill, StoryboardFrame } from "../src/data/types";

vi.mock("@capacitor/filesystem", () => ({ Filesystem: {}, Directory: { Documents: "DOCUMENTS" } }));
vi.mock("../src/data/catalogue", () => ({}));
vi.mock("../src/data/assets", () => ({ CONTENT_DIR: "content" }));

const { diffCatalogues, fingerprintCatalogue, hasChanges, dismissWhatsNew, isWhatsNewDismissed, undismissWhatsNew } =
  await import("../src/data/whatsNew");

const skill = (id: number, title: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  slug: title.toLowerCase(),
  title,
  category_id: null,
  description: "",
  thumbnail_asset: null,
  created_at: "2026-01-01",
  ...extra,
});

const resource = (id: number, skillId: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  skill_id: skillId,
  type: "storyboard",
  title: "Steps",
  content: "",
  asset: null,
  requires_internet: 0,
  position: 0,
  ...extra,
});

const frame = (resourceId: number, position: number, caption: string): StoryboardFrame => ({
  id: position + 1,
  resource_id: resourceId,
  position,
  asset: `assets/${position}.png`,
  alt: "",
  caption,
});

describe("diffCatalogues", () => {
  it("finds added, updated and removed skills, sorted by title", () => {
    const before = fingerprintCatalogue([skill(1, "Zulu"), skill(2, "Bravo"), skill(3, "Gone")], [], []);
    const after = fingerprintCatalogue(
      [skill(1, "Zulu", { description: "new" }), skill(2, "Bravo"), skill(4, "Alpha"), skill(5, "Yankee")],
      [],
      []
    );
    expect(diffCatalogues(before, after)).toEqual({
      added: [
        { slug: "alpha", title: "Alpha" },
        { slug: "yankee", title: "Yankee" },
      ],
      updated: [{ slug: "zulu", title: "Zulu" }],
      removed: ["Gone"],
    });
  });

  it("notices a changed caption, video file, chapter or key point", () => {
    const skills = [skill(1, "A")];
    const base = fingerprintCatalogue(skills, [resource(10, 1)], [frame(10, 0, "Wash hands")]);
    const changes = [
      fingerprintCatalogue(skills, [resource(10, 1)], [frame(10, 0, "Clean hands")]),
      fingerprintCatalogue(skills, [resource(10, 1, { type: "local_video", asset: "assets/x.mp4" })], []),
      fingerprintCatalogue(skills, [resource(10, 1, { chapters: '[{"time":1,"title":"x"}]' })], [frame(10, 0, "Wash hands")]),
      fingerprintCatalogue([skill(1, "A", { red_flags: "Faints" })], [resource(10, 1)], [frame(10, 0, "Wash hands")]),
    ];
    for (const after of changes) {
      expect(diffCatalogues(base, after).updated).toHaveLength(1);
    }
  });

  it("doesn't count fields a release didn't have yet as changes", () => {
    const old = fingerprintCatalogue([skill(1, "A")], [resource(10, 1)], []);
    const upgraded = fingerprintCatalogue(
      [skill(1, "A", { indications: "", equipment: "", red_flags: "", contraindications: "", common_errors: "" })],
      [resource(10, 1, { chapters: "[]" })],
      []
    );
    expect(hasChanges(diffCatalogues(old, upgraded))).toBe(false);
  });
});

describe("dismissing", () => {
  it("is remembered per release", () => {
    undismissWhatsNew();
    expect(isWhatsNewDismissed("r1")).toBe(false);
    dismissWhatsNew("r1");
    expect(isWhatsNewDismissed("r1")).toBe(true);
    expect(isWhatsNewDismissed("r2")).toBe(false);
  });
});
