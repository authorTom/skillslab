import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.hoisted(() => ({ freeSpace: vi.fn() }));
vi.mock("../src/data/contentPackage", () => ({
  ContentPackage: native,
  canInstallFromFiles: () => true,
}));

const { checkSpaceFor } = await import("../src/data/updater");
const { SPACE_MARGIN } = await import("../src/data/fileInstall");

const GB = 1024 ** 3;

beforeEach(() => vi.clearAllMocks());

describe("checkSpaceFor", () => {
  it("allows an update that fits with room to spare", async () => {
    native.freeSpace.mockResolvedValue({ bytes: 4 * GB });
    expect(await checkSpaceFor(2 * GB)).toBeNull();
  });

  it("refuses one that would leave less than the margin, saying how much is needed", async () => {
    native.freeSpace.mockResolvedValue({ bytes: 2 * GB });
    const error = await checkSpaceFor(2 * GB - SPACE_MARGIN / 2);
    expect(error).toMatch(/needs .* but this iPad has 2\.0 GB free/);
  });

  it("tries anyway when free space can't be read", async () => {
    native.freeSpace.mockRejectedValue(new Error("unavailable"));
    expect(await checkSpaceFor(100 * GB)).toBeNull();
  });
});
