import { describe, it, expect } from "vitest";

function parseHash(hash: string) {
  const path = hash.replace(/^#\/?/, "") || "";
  if (path === "settings") return { page: "settings" as const, params: {} };
  const skillMatch = path.match(/^skill\/(.+)$/);
  if (skillMatch) return { page: "skill" as const, params: { slug: skillMatch[1] } };
  return { page: "home" as const, params: {} };
}

describe("hash router", () => {
  it("parses empty hash as home", () => {
    expect(parseHash("")).toEqual({ page: "home", params: {} });
    expect(parseHash("#")).toEqual({ page: "home", params: {} });
    expect(parseHash("#/")).toEqual({ page: "home", params: {} });
  });

  it("parses skill route with slug", () => {
    expect(parseHash("#/skill/blood-pressure")).toEqual({
      page: "skill",
      params: { slug: "blood-pressure" },
    });
  });

  it("parses settings route", () => {
    expect(parseHash("#/settings")).toEqual({ page: "settings", params: {} });
  });

  it("falls back to home for unknown routes", () => {
    expect(parseHash("#/unknown")).toEqual({ page: "home", params: {} });
    expect(parseHash("#/foo/bar")).toEqual({ page: "home", params: {} });
  });
});
