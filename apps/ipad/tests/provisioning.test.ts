// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const managedConfig = vi.fn();
vi.mock("@/data/contentPackage", () => ({
  canInstallFromFiles: () => true,
  ContentPackage: {
    managedConfig: () => managedConfig(),
    verifySignature: async () => ({ valid: true }),
  },
}));

import {
  loadManagedConfig,
  provisioningReady,
  resetProvisioning,
  resolveSetting,
  watchManagedConfig,
} from "@/data/provisioning";
import { getServerUrl, getServerUrlSetting, setServerUrl } from "@/data/settings";
import { canEditPublicKey, getPublicKeySetting, isSignatureEnforced, setPublicKey, verifySignature } from "@/data/signature";

const MDM_KEY = Buffer.alloc(32, 9).toString("base64");
const BUILD_KEY = Buffer.alloc(32, 8).toString("base64");
const APP_KEY = Buffer.alloc(32, 7).toString("base64");

describe("resolveSetting", () => {
  it("prefers managed configuration, then the build, then the app", () => {
    expect(resolveSetting("m", "b", "a")).toEqual({ value: "m", source: "managed" });
    expect(resolveSetting(undefined, "b", "a")).toEqual({ value: "b", source: "build" });
    expect(resolveSetting(" ", "", "a")).toEqual({ value: "a", source: "app" });
    expect(resolveSetting(undefined, undefined, "")).toEqual({ value: "", source: null });
  });
});

describe("provisioned settings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetProvisioning();
    managedConfig.mockReset().mockResolvedValue({});
    vi.stubEnv("VITE_SERVER_URL", "");
    vi.stubEnv("VITE_SIGNING_PUBLIC_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses what was entered in the app when nothing is provisioned", async () => {
    await loadManagedConfig();
    setServerUrl("https://typed.example");
    setPublicKey(APP_KEY);
    expect(getServerUrlSetting()).toEqual({ value: "https://typed.example", source: "app" });
    expect(getPublicKeySetting()).toEqual({ value: APP_KEY, source: "app" });
    expect(canEditPublicKey()).toBe(true);
    setPublicKey("");
    expect(isSignatureEnforced()).toBe(false);
  });

  it("lets a built-in default override the app, and locks the key", async () => {
    vi.stubEnv("VITE_SERVER_URL", "https://built.example/");
    vi.stubEnv("VITE_SIGNING_PUBLIC_KEY", BUILD_KEY);
    localStorage.setItem("skillslab_signing_public_key", APP_KEY);
    await loadManagedConfig();
    expect(getServerUrlSetting()).toEqual({ value: "https://built.example", source: "build" });
    expect(getPublicKeySetting()).toEqual({ value: BUILD_KEY, source: "build" });
    expect(canEditPublicKey()).toBe(false);
    expect(() => setPublicKey("")).toThrow(/can’t be changed/);
    expect(() => setPublicKey(APP_KEY)).toThrow();
    expect(isSignatureEnforced()).toBe(true);
  });

  it("lets managed configuration override everything", async () => {
    vi.stubEnv("VITE_SERVER_URL", "https://built.example");
    vi.stubEnv("VITE_SIGNING_PUBLIC_KEY", BUILD_KEY);
    managedConfig.mockResolvedValue({ serverUrl: "https://mdm.example", signingPublicKey: MDM_KEY });
    await loadManagedConfig();
    expect(getServerUrl()).toBe("https://mdm.example");
    expect(getPublicKeySetting()).toEqual({ value: MDM_KEY, source: "managed" });
    expect(() => setPublicKey("")).toThrow();
  });

  it("re-reads managed configuration when the app returns to the foreground", async () => {
    await loadManagedConfig();
    expect(getServerUrlSetting().source).toBe(null);

    const stop = watchManagedConfig();
    managedConfig.mockResolvedValue({ serverUrl: "https://pushed-later.example" });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await provisioningReady();
    stop();
    expect(getServerUrlSetting()).toEqual({ value: "https://pushed-later.example", source: "managed" });
  });

  it("waits for managed configuration before checking a signature", async () => {
    let release!: (v: object) => void;
    managedConfig.mockReturnValue(new Promise((resolve) => (release = resolve)));
    void loadManagedConfig();
    // Unsigned, and no key entered in the app: but the MDM's key is coming.
    const result = verifySignature({
      format: "skillslab-content", package_schema_version: 1, content_schema_version: 1,
      release_id: "r", release_version: "1", created_at: "t",
      catalogue: { filename: "c", bytes: 1, sha256: "h" }, assets: [],
      total_uncompressed_bytes: 1, counts: { groups: 0, categories: 0, skills: 0, resources: 0, assets: 0 },
      min_app_content_schema_version: 1,
    });
    release({ signingPublicKey: MDM_KEY });
    expect(await result).toMatchObject({ valid: false, reason: expect.stringContaining("unsigned") });
  });
});
