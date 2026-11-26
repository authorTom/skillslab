import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReleaseManifest } from "../src/data/types";

/**
 * An in-memory stand-in for @capacitor/filesystem: files keyed by
 * "<directory>/<path>", directories implied by the paths under them.
 */
const fs = vi.hoisted(() => {
  const files = new Map<string, string>();
  const key = (directory: string, path: string) => `${directory}/${path}`;
  const missing = (path: string) => Object.assign(new Error(`${path} does not exist`), { code: "OS-PLUG-FILE-0008" });
  const isDir = (k: string) => [...files.keys()].some((f) => f.startsWith(`${k}/`));
  return {
    files,
    Filesystem: {
      async stat({ path, directory }: { path: string; directory: string }) {
        const k = key(directory, path);
        if (files.has(k)) return { type: "file", size: files.get(k)!.length };
        if (isDir(k)) return { type: "directory", size: 0 };
        throw missing(path);
      },
      async readFile({ path, directory, encoding }: { path: string; directory: string; encoding?: string }) {
        const data = files.get(key(directory, path));
        if (data === undefined) throw missing(path);
        return { data: encoding ? data : btoa(data) };
      },
      async writeFile({ path, directory, data }: { path: string; directory: string; data: string }) {
        files.set(key(directory, path), data);
      },
      async copy({ from, to, directory, toDirectory }: { from: string; to: string; directory: string; toDirectory: string }) {
        const data = files.get(key(directory, from));
        if (data === undefined) throw missing(from);
        files.set(key(toDirectory, to), data);
      },
      async rename({ from, to, directory, toDirectory }: { from: string; to: string; directory: string; toDirectory: string }) {
        const data = files.get(key(directory, from));
        if (data === undefined) throw missing(from);
        files.delete(key(directory, from));
        files.set(key(toDirectory, to), data);
      },
      async deleteFile({ path, directory }: { path: string; directory: string }) {
        if (!files.delete(key(directory, path))) throw missing(path);
      },
      async readdir({ path, directory }: { path: string; directory: string }) {
        const prefix = `${key(directory, path)}/`;
        const names = new Set<string>();
        for (const f of files.keys()) {
          if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split("/")[0]);
        }
        return { files: [...names].map((name) => ({ name, type: isDir(`${prefix}${name}`) ? "directory" : "file" })) };
      },
      async mkdir() {},
      async rmdir({ path, directory }: { path: string; directory: string }) {
        const prefix = `${key(directory, path)}/`;
        for (const f of [...files.keys()]) if (f.startsWith(prefix)) files.delete(f);
      },
    },
  };
});

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: fs.Filesystem,
  Directory: { Documents: "DOCUMENTS", Library: "LIBRARY" },
}));
/** Skills in each catalogue, keyed by the catalogue file's contents, so the
 *  mock serves whichever catalogue is live. */
const catalogues = vi.hoisted(() => new Map<string, Record<string, unknown>[]>());
vi.mock("../src/data/catalogue", () => ({
  openCatalogue: vi.fn().mockResolvedValue(true),
  closeCatalogue: vi.fn().mockResolvedValue(undefined),
  isOpen: () => true,
  listSkills: async () => catalogues.get(fs.files.get("LIBRARY/CapacitorDatabase/catalogueSQLite.db") ?? "") ?? [],
  listAllResources: async () => [],
  listAllStoryboardFrames: async () => [],
}));
vi.mock("../src/data/signature", () => ({
  verifySignature: vi.fn().mockResolvedValue({ valid: true }),
  isSignatureEnforced: () => false,
}));

const { activate, assetsToPrune, getPackageState, rollback } = await import("../src/data/packages");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DOCS = "DOCUMENTS";
const LIVE_CATALOGUE = "LIBRARY/CapacitorDatabase/catalogueSQLite.db";

/** A release whose catalogue and each named asset have the given contents. */
function release(id: string, assets: string[]): { manifest: ReleaseManifest; catalogue: string; contents: Map<string, string> } {
  const catalogue = `catalogue of ${id}`;
  const contents = new Map(assets.map((body) => [`assets/${sha(body)}.mp4`, body]));
  return {
    catalogue,
    contents,
    manifest: {
      format: "skillslab-content",
      package_schema_version: 1,
      content_schema_version: 1,
      release_id: id,
      release_version: id,
      created_at: "2026-11-01T00:00:00.000Z",
      catalogue: { filename: "catalogue.sqlite", bytes: catalogue.length, sha256: sha(catalogue) },
      assets: assets.map((body, i) => ({
        media_id: i + 1,
        path: `assets/${sha(body)}.mp4`,
        mime: "video/mp4",
        bytes: body.length,
        sha256: sha(body),
      })),
      total_uncompressed_bytes: 0,
      counts: { groups: 0, categories: 0, skills: 0, resources: 0, assets: assets.length },
      min_app_content_schema_version: 1,
    },
  };
}

/** Stage the catalogue and the assets not already active, as a download does. */
function stage(r: ReturnType<typeof release>, skip: string[] = []) {
  fs.files.set(`${DOCS}/staging/catalogue.sqlite`, r.catalogue);
  for (const [path, body] of r.contents) {
    if (skip.includes(body) || fs.files.has(`${DOCS}/content/${path}`)) continue;
    fs.files.set(`${DOCS}/staging/${path}`, body);
  }
}

const activeAssets = () =>
  [...fs.files.keys()]
    .filter((k) => k.startsWith(`${DOCS}/content/assets/`))
    .map((k) => fs.files.get(k))
    .sort();
const staged = () => [...fs.files.keys()].filter((k) => k.startsWith(`${DOCS}/staging/`));

beforeEach(() => {
  fs.files.clear();
});

describe("activate", () => {
  it("installs a first release by moving its files into place", async () => {
    const r1 = release("r1", ["video-a", "video-b"]);
    stage(r1);
    await activate(r1.manifest);

    expect(activeAssets()).toEqual(["video-a", "video-b"]);
    expect(fs.files.get(LIVE_CATALOGUE)).toBe(r1.catalogue);
    expect(staged()).toEqual([]);
    expect((await getPackageState()).current?.releaseId).toBe("r1");
  });

  it("keeps the previous release's files for rollback and deletes older ones", async () => {
    const r1 = release("r1", ["video-a", "video-b"]);
    const r2 = release("r2", ["video-b", "video-c"]);
    const r3 = release("r3", ["video-c", "video-d"]);

    stage(r1);
    await activate(r1.manifest);
    stage(r2);
    await activate(r2.manifest);
    // r1's video-a stays: r1 is what a rollback would restore.
    expect(activeAssets()).toEqual(["video-a", "video-b", "video-c"]);

    stage(r3);
    await activate(r3.manifest);
    // r1 can no longer be restored, so video-a goes; r2's video-b stays.
    expect(activeAssets()).toEqual(["video-b", "video-c", "video-d"]);

    await rollback();
    expect(fs.files.get(LIVE_CATALOGUE)).toBe(r2.catalogue);
    expect((await getPackageState()).current?.releaseId).toBe("r2");
  });

  it("refuses a release with a missing file and leaves the installed content alone", async () => {
    const r1 = release("r1", ["video-a"]);
    stage(r1);
    await activate(r1.manifest);

    const r2 = release("r2", ["video-a", "video-new"]);
    stage(r2, ["video-new"]);
    await expect(activate(r2.manifest)).rejects.toThrow(/missing/);

    expect(fs.files.get(LIVE_CATALOGUE)).toBe(r1.catalogue);
    expect((await getPackageState()).current?.releaseId).toBe("r1");
    expect(activeAssets()).toEqual(["video-a"]);
  });

  it("deletes nothing when the previous release's file list is unknown", async () => {
    // Installed by an app version that didn't keep manifests.
    const old = release("r0", ["video-old"]);
    for (const [path, body] of old.contents) fs.files.set(`${DOCS}/content/${path}`, body);
    fs.files.set(LIVE_CATALOGUE, old.catalogue);
    fs.files.set(
      `${DOCS}/content/state.json`,
      JSON.stringify({ current: { releaseId: "r0", version: "r0", createdAt: "" }, previous: null })
    );

    const r1 = release("r1", ["video-a"]);
    stage(r1);
    await activate(r1.manifest);
    expect(activeAssets()).toEqual(["video-a", "video-old"]);
  });

  it("does not trust a stale previous manifest from an older release", async () => {
    const r1 = release("r1", ["video-a"]);
    stage(r1);
    await activate(r1.manifest);
    const r2 = release("r2", ["video-b"]);
    stage(r2);
    await activate(r2.manifest);
    // The current manifest goes missing, so previous-manifest.json still
    // describes r1 when r3 arrives, though r2 is the release kept.
    fs.files.delete(`${DOCS}/content/manifest.json`);
    const r3 = release("r3", ["video-c"]);
    stage(r3);
    await activate(r3.manifest);
    expect(activeAssets()).toEqual(["video-a", "video-b", "video-c"]);
  });

  it("replaces a damaged file when repairing, keeping the rollback history", async () => {
    const r1 = release("r1", ["video-a"]);
    const r2 = release("r2", ["video-b"]);
    stage(r1);
    await activate(r1.manifest);
    stage(r2);
    await activate(r2.manifest);

    const path = r2.manifest.assets[0].path;
    fs.files.set(`${DOCS}/content/${path}`, "damaged");
    fs.files.set(`${DOCS}/staging/catalogue.sqlite`, r2.catalogue);
    fs.files.set(`${DOCS}/staging/${path}`, "video-b");
    await activate(r2.manifest, { repair: true });

    expect(fs.files.get(`${DOCS}/content/${path}`)).toBe("video-b");
    expect(activeAssets()).toEqual(["video-a", "video-b"]);
    expect((await getPackageState()).previous?.releaseId).toBe("r1");
  });
});

describe("assetsToPrune", () => {
  const r = release("r", ["kept"]).manifest;
  const keptName = r.assets[0].path.replace("assets/", "");

  it("lists only files no kept release uses", () => {
    expect(assetsToPrune([keptName, "other.mp4"], [r])).toEqual(["other.mp4"]);
  });

  it("lists nothing when a kept release's files are unknown", () => {
    expect(assetsToPrune([keptName, "other.mp4"], null)).toEqual([]);
  });
});

describe("what's new", () => {
  const skill = (id: number, title: string, description = "") => ({
    id,
    slug: title.toLowerCase(),
    title,
    category_id: null,
    description,
    thumbnail_asset: null,
    created_at: "",
  });
  const whatsNew = () => {
    const data = fs.files.get(`${DOCS}/content/whats-new.json`);
    return data === undefined ? null : JSON.parse(data);
  };

  it("records the skills an update added, changed and removed, and forgets them on rollback", async () => {
    const r1 = release("r1", ["video-a"]);
    const r2 = release("r2", ["video-a"]);
    catalogues.set(r1.catalogue, [skill(1, "Alpha"), skill(2, "Bravo")]);
    catalogues.set(r2.catalogue, [skill(1, "Alpha", "changed"), skill(3, "Charlie")]);

    stage(r1);
    await activate(r1.manifest);
    // Nothing to compare a first install with.
    expect(whatsNew()).toBeNull();

    stage(r2);
    await activate(r2.manifest);
    expect(whatsNew()).toEqual({
      releaseId: "r2",
      version: "r2",
      fromVersion: "r1",
      added: [{ slug: "charlie", title: "Charlie" }],
      updated: [{ slug: "alpha", title: "Alpha" }],
      removed: ["Bravo"],
    });

    await rollback();
    expect(whatsNew()).toBeNull();
  });
});
