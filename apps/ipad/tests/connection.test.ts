// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const diagnose = vi.fn();
let native = true;

vi.mock("@/data/contentPackage", () => ({
  canInstallFromFiles: () => native,
  ContentPackage: { diagnoseConnection: (options: { url: string }) => diagnose(options) },
}));
vi.mock("@capacitor/network", () => ({ Network: { getStatus: async () => ({ connected: true }) } }));
vi.mock("@capacitor/filesystem", () => ({ Filesystem: {}, Directory: {} }));
vi.mock("@capacitor/file-transfer", () => ({ FileTransfer: {} }));
vi.mock("@/data/packages", () => ({
  validateManifest: () => [],
  cleanStaging: async () => {},
  activate: async () => {},
  getPackageState: async () => ({ current: null, previous: null }),
}));

import { connectionMessage, explainFetchFailure, UNREACHABLE } from "@/data/connection";
import { checkForUpdate } from "@/data/updater";
import { setServerUrl } from "@/data/settings";

describe("connection failures", () => {
  beforeEach(() => {
    native = true;
    diagnose.mockReset();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names an untrusted certificate, the usual internal-CA problem", async () => {
    diagnose.mockResolvedValue({ problem: "untrusted-certificate", code: -1202 });
    const message = await explainFetchFailure("https://skillslab.trust.internal/api/offline/releases/latest");
    expect(message).toMatch(/doesn’t trust the server’s certificate/);
    expect(diagnose).toHaveBeenCalledWith({ url: "https://skillslab.trust.internal/api/offline/releases/latest" });
  });

  it("has a message for every problem the native side reports", () => {
    for (const problem of [
      "certificate-date", "secure-connection", "host-not-found", "cannot-connect", "timed-out", "offline",
    ] as const) {
      expect(connectionMessage(problem)).not.toBe(UNREACHABLE);
    }
    expect(connectionMessage("other")).toBe(UNREACHABLE);
    expect(connectionMessage("none")).toBe(UNREACHABLE);
  });

  it("falls back to the generic message in a browser or if diagnosis fails", async () => {
    native = false;
    expect(await explainFetchFailure("https://x")).toBe(UNREACHABLE);
    native = true;
    diagnose.mockRejectedValue(new Error("boom"));
    expect(await explainFetchFailure("https://x")).toBe(UNREACHABLE);
  });

  it("is what checkForUpdate reports when fetch fails", async () => {
    setServerUrl("https://skillslab.trust.internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    diagnose.mockResolvedValue({ problem: "host-not-found" });
    const result = await checkForUpdate();
    expect(result).toMatchObject({ available: false, reason: expect.stringMatching(/address wasn’t found/) });
  });

  it("won't check a saved http address", async () => {
    setServerUrl("http://skillslab.trust.internal");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkForUpdate();
    expect(result).toMatchObject({ available: false, reason: expect.stringContaining("https://") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
