import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.hoisted(() => ({ keepAwake: vi.fn(() => Promise.resolve()) }));

vi.mock("../src/data/contentPackage", () => ({
  ContentPackage: native,
  canInstallFromFiles: () => true,
}));

const { CONTENT_BUSY, exclusive, isContentBusy, onContentBusyChange } = await import("../src/data/contentLock");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("exclusive", () => {
  beforeEach(() => native.keepAwake.mockClear());

  it("refuses a second operation while one is running", async () => {
    const gate = deferred();
    const first = exclusive(() => gate.promise);
    expect(isContentBusy()).toBe(true);
    await expect(exclusive(async () => "second")).rejects.toThrow(CONTENT_BUSY);
    gate.resolve();
    await first;
    expect(isContentBusy()).toBe(false);
    await expect(exclusive(async () => "third")).resolves.toBe("third");
  });

  it("releases the lock when the operation fails", async () => {
    await expect(exclusive(() => Promise.reject(new Error("disk full")))).rejects.toThrow("disk full");
    expect(isContentBusy()).toBe(false);
  });

  it("keeps the iPad awake only while an operation runs", async () => {
    const gate = deferred();
    const run = exclusive(() => gate.promise);
    expect(native.keepAwake).toHaveBeenLastCalledWith({ on: true });
    gate.resolve();
    await run;
    expect(native.keepAwake).toHaveBeenLastCalledWith({ on: false });
  });

  it("tells listeners when it starts and finishes", async () => {
    const seen: boolean[] = [];
    const stop = onContentBusyChange(() => seen.push(isContentBusy()));
    await exclusive(async () => {});
    stop();
    expect(seen).toEqual([true, false]);
  });
});
