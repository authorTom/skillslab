import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatAppVersion } from "@/data/appInfo";

const SCRIPT = path.resolve(__dirname, "..", "scripts", "set-version.mjs");

describe("set-version script", () => {
  let root: string;
  const project = () => fs.readFileSync(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(root, "scripts/set-version.mjs"), ...args], { encoding: "utf8" });

  beforeEach(() => {
    // A copy of the script beside a minimal project, as in apps/ipad.
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-version-"));
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(SCRIPT, path.join(root, "scripts/set-version.mjs"));
    fs.mkdirSync(path.join(root, "ios/App/App.xcodeproj"), { recursive: true });
    const config = "\t\t\t\tCURRENT_PROJECT_VERSION = 7;\n\t\t\t\tMARKETING_VERSION = 1.0;\n";
    fs.writeFileSync(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"), `Debug = {\n${config}};\nRelease = {\n${config}};\n`);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "x", version: "0.1.0" }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("sets the version and the next build number in every configuration", () => {
    expect(run("1.2").status).toBe(0);
    expect(project().match(/MARKETING_VERSION = 1\.2;/g)).toHaveLength(2);
    expect(project().match(/CURRENT_PROJECT_VERSION = 8;/g)).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version).toBe("1.2.0");
  });

  it("takes an explicit build number, and shows the current values", () => {
    expect(run("2.0.1", "42").status).toBe(0);
    expect(execFileSync(process.execPath, [path.join(root, "scripts/set-version.mjs"), "--show"], { encoding: "utf8" }))
      .toContain("version 2.0.1, build 42");
  });

  it("refuses values App Store Connect wouldn't accept, changing nothing", () => {
    const before = project();
    expect(run("v1.2").status).toBe(1);
    expect(run("1.2.3.4").status).toBe(1);
    expect(run("1.2", "abc").status).toBe(1);
    expect(project()).toBe(before);
  });
});

describe("app version", () => {
  afterEach(() => {
    vi.doUnmock("@/data/contentPackage");
    vi.resetModules();
  });

  it("formats version and build like iOS Settings", () => {
    expect(formatAppVersion({ version: "1.2.0", build: "14" })).toBe("1.2.0 (14)");
    expect(formatAppVersion({ version: "1.2.0", build: null })).toBe("1.2.0");
  });

  it("reads the app bundle's version on a device", async () => {
    vi.doMock("@/data/contentPackage", () => ({
      canInstallFromFiles: () => true,
      ContentPackage: { appInfo: async () => ({ version: "1.3.0", build: "21" }) },
    }));
    const { getAppVersion } = await import("@/data/appInfo");
    expect(await getAppVersion()).toEqual({ version: "1.3.0", build: "21" });
  });

  it("falls back to package.json's version in a browser", async () => {
    vi.doMock("@/data/contentPackage", () => ({ canInstallFromFiles: () => false, ContentPackage: {} }));
    const { getAppVersion } = await import("@/data/appInfo");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(await getAppVersion()).toEqual({ version: pkg.version, build: null });
  });
});
