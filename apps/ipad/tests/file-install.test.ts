import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReleaseManifest } from "../src/data/types";

const native = vi.hoisted(() => ({
  verify: vi.fn(),
  freeSpace: vi.fn(),
  close: vi.fn(),
  install: vi.fn(),
  addListener: vi.fn(),
}));
const packages = vi.hoisted(() => ({
  getPackageState: vi.fn(),
  activate: vi.fn(),
  cleanStaging: vi.fn(),
}));

vi.mock("../src/data/contentPackage", () => ({
  ContentPackage: native,
}));
vi.mock("../src/data/packages", async (original) => ({
  ...(await original<typeof import("../src/data/packages")>()),
  ...packages,
}));

const { hasEnoughSpace, installCandidate, installKind, manifestFiles, prepareCandidate, SPACE_MARGIN } = await import(
  "../src/data/fileInstall"
);

const A = "a".repeat(64);
const B = "b".repeat(64);
const GB = 1024 ** 3;

function manifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  return {
    format: "skillslab-content",
    package_schema_version: 1,
    content_schema_version: 1,
    release_id: "rel-2",
    release_version: "2.0",
    created_at: "2026-09-30T10:00:00.000Z",
    catalogue: { filename: "catalogue.sqlite", bytes: 1000, sha256: "c".repeat(64) },
    assets: [
      { media_id: 1, path: `assets/${A}.mp4`, mime: "video/mp4", bytes: 5000, sha256: A },
      { media_id: 2, path: `assets/${B}.pdf`, mime: "application/pdf", bytes: 300, sha256: B },
      { media_id: 3, path: `assets/${B}.pdf`, mime: "application/pdf", bytes: 300, sha256: B },
    ],
    total_uncompressed_bytes: 6300,
    counts: { groups: 1, categories: 1, skills: 2, resources: 3, assets: 3 },
    min_app_content_schema_version: 1,
    ...overrides,
  };
}

const opened = (m: ReleaseManifest) => ({ id: "pkg-1", name: "skillslab-v2.0.skillslab", manifest: JSON.stringify(m) });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  native.verify.mockResolvedValue({ problems: [] });
  native.freeSpace.mockResolvedValue({ bytes: 10 * GB });
  native.close.mockResolvedValue(undefined);
  native.install.mockResolvedValue(undefined);
  native.addListener.mockResolvedValue({ remove: vi.fn() });
  packages.getPackageState.mockResolvedValue({ current: null, previous: null });
  packages.activate.mockResolvedValue(undefined);
  packages.cleanStaging.mockResolvedValue(undefined);
});

describe("manifestFiles", () => {
  it("lists the catalogue, then each asset once", () => {
    expect(manifestFiles(manifest()).map((f) => f.path)).toEqual([
      "catalogue.sqlite",
      `assets/${A}.mp4`,
      `assets/${B}.pdf`,
    ]);
  });
});

describe("installKind", () => {
  const m = manifest();
  it("is new on an empty iPad or for a later release", () => {
    expect(installKind(m, null)).toBe("new");
    expect(installKind(m, { releaseId: "rel-1", createdAt: "2026-01-01T00:00:00.000Z" })).toBe("new");
  });
  it("is older for a release made before the installed one", () => {
    expect(installKind(m, { releaseId: "rel-3", createdAt: "2026-12-01T00:00:00.000Z" })).toBe("older");
  });
  it("is a repair for the installed release", () => {
    expect(installKind(m, { releaseId: "rel-2", createdAt: m.created_at })).toBe("repair");
  });
});

describe("prepareCandidate", () => {
  it("copies the catalogue and only the assets not already installed", async () => {
    native.verify.mockResolvedValue({ problems: [{ path: `assets/${A}.mp4`, problem: "missing" }] });
    const c = await prepareCandidate(opened(manifest()));
    expect(native.verify).toHaveBeenCalledWith(expect.objectContaining({ directory: "content", checkHashes: false }));
    expect(c.kind).toBe("new");
    expect(c.files.map((f) => f.path)).toEqual(["catalogue.sqlite", `assets/${A}.mp4`]);
    expect(c.copyBytes).toBe(6000);
    expect(hasEnoughSpace(c)).toBe(true);
  });

  it("reads installed files in full for a repair", async () => {
    packages.getPackageState.mockResolvedValue({
      current: { releaseId: "rel-2", version: "2.0", createdAt: "2026-09-30T10:00:00.000Z" },
      previous: null,
    });
    native.verify.mockResolvedValue({ problems: [{ path: `assets/${B}.pdf`, problem: "damaged" }] });
    const c = await prepareCandidate(opened(manifest()));
    expect(native.verify).toHaveBeenCalledWith(expect.objectContaining({ checkHashes: true }));
    expect(c.kind).toBe("repair");
    expect(c.damagedCount).toBe(1);
  });

  it("reports when there isn't room", async () => {
    native.verify.mockResolvedValue({ problems: [{ path: `assets/${A}.mp4`, problem: "missing" }] });
    native.freeSpace.mockResolvedValue({ bytes: 6000 + SPACE_MARGIN - 1 });
    expect(hasEnoughSpace(await prepareCandidate(opened(manifest())))).toBe(false);
  });

  it("rejects an invalid manifest and closes the package", async () => {
    await expect(prepareCandidate(opened(manifest({ format: "other" })))).rejects.toThrow("Unsupported package format");
    expect(native.close).toHaveBeenCalledWith({ id: "pkg-1" });
  });

  it("rejects unreadable JSON", async () => {
    await expect(prepareCandidate({ id: "pkg-1", name: "x", manifest: "<html>" })).rejects.toThrow("can’t be read");
    expect(native.close).toHaveBeenCalled();
  });

  it("rejects an unsigned package when signing is enforced", async () => {
    localStorage.setItem("skillslab_signing_public_key", btoa("k".repeat(32)));
    await expect(prepareCandidate(opened(manifest()))).rejects.toThrow("unsigned");
  });
});

describe("installCandidate", () => {
  it("stages the files natively, then activates", async () => {
    const c = await prepareCandidate(opened(manifest()));
    await installCandidate(c, () => {});
    expect(native.install).toHaveBeenCalledWith({ id: "pkg-1", files: c.files, directory: "staging" });
    expect(packages.activate).toHaveBeenCalledWith(c.manifest, { repair: false });
  });

  it("cleans up staging when copying fails", async () => {
    const c = await prepareCandidate(opened(manifest()));
    native.install.mockRejectedValue(new Error("The package file ended early."));
    await expect(installCandidate(c, () => {})).rejects.toThrow("ended early");
    expect(packages.activate).not.toHaveBeenCalled();
    expect(packages.cleanStaging).toHaveBeenCalledTimes(2);
  });
});
