// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const network = { connected: true };
const checkForUpdate = vi.fn();
let installed: string | null = null;
let serverUrl = "https://skillslab.trust.internal";

vi.mock("@capacitor/network", () => ({ Network: { getStatus: async () => network } }));
vi.mock("@/data/provisioning", () => ({ provisioningReady: async () => {} }));
vi.mock("@/data/settings", () => ({ getServerUrl: () => serverUrl }));
vi.mock("@/data/packages", () => ({
  getPackageState: async () => ({ current: installed ? { releaseId: installed } : null, previous: null }),
}));
vi.mock("@/data/updater", () => ({ UP_TO_DATE: "Content is up to date.", checkForUpdate: () => checkForUpdate() }));

import {
  autoCheckForUpdate,
  CHECK_INTERVAL_MS,
  getAvailableUpdate,
  subscribeAvailableUpdate,
  syncAvailableUpdate,
} from "@/data/autoCheck";

const newer = { available: true, manifest: { release_id: "r2", release_version: "1.1.0" } };
const T0 = 1_800_000_000_000;

describe("automatic update check", () => {
  beforeEach(() => {
    localStorage.clear();
    checkForUpdate.mockReset();
    network.connected = true;
    installed = "r1";
    serverUrl = "https://skillslab.trust.internal";
  });

  it("flags a newer release, and tells the home screen", async () => {
    checkForUpdate.mockResolvedValue(newer);
    const listener = vi.fn();
    const stop = subscribeAvailableUpdate(listener);
    await autoCheckForUpdate(T0);
    stop();
    expect(getAvailableUpdate()).toEqual({ releaseId: "r2", version: "1.1.0" });
    expect(listener).toHaveBeenCalled();
  });

  it("checks at most once per interval", async () => {
    checkForUpdate.mockResolvedValue(newer);
    await autoCheckForUpdate(T0);
    await autoCheckForUpdate(T0 + 60_000);
    await autoCheckForUpdate(T0 + CHECK_INTERVAL_MS - 1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    await autoCheckForUpdate(T0 + CHECK_INTERVAL_MS);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("does nothing offline or without a server, and doesn't use up the interval", async () => {
    network.connected = false;
    await autoCheckForUpdate(T0);
    serverUrl = "";
    network.connected = true;
    await autoCheckForUpdate(T0);
    expect(checkForUpdate).not.toHaveBeenCalled();
    serverUrl = "https://skillslab.trust.internal";
    checkForUpdate.mockResolvedValue(newer);
    await autoCheckForUpdate(T0 + 1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the check fails, keeping what it knew", async () => {
    checkForUpdate.mockResolvedValue(newer);
    await autoCheckForUpdate(T0);
    checkForUpdate.mockRejectedValue(new Error("boom"));
    await expect(autoCheckForUpdate(T0 + CHECK_INTERVAL_MS)).resolves.toBeUndefined();
    checkForUpdate.mockResolvedValue({ available: false, reason: "Could not reach the server." });
    await autoCheckForUpdate(T0 + 2 * CHECK_INTERVAL_MS);
    expect(getAvailableUpdate()?.releaseId).toBe("r2");
  });

  it("clears the indicator when the server says it's up to date, or once installed", async () => {
    checkForUpdate.mockResolvedValue(newer);
    await autoCheckForUpdate(T0);
    checkForUpdate.mockResolvedValue({ available: false, reason: "Content is up to date." });
    await autoCheckForUpdate(T0 + CHECK_INTERVAL_MS);
    expect(getAvailableUpdate()).toBeNull();

    checkForUpdate.mockResolvedValue(newer);
    await autoCheckForUpdate(T0 + 2 * CHECK_INTERVAL_MS);
    installed = "r2";
    await syncAvailableUpdate();
    expect(getAvailableUpdate()).toBeNull();
  });

  it("never downloads anything: it doesn't touch the download code", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../src/data/autoCheck.ts"), "utf8");
    expect(source).not.toMatch(/downloadAndActivate|FileTransfer|activate\(/);
  });
});
