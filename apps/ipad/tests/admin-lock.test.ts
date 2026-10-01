import { describe, it, expect, beforeEach } from "vitest";
import { checkPin, clearPin, isPinSet, isValidPin, lockoutRemaining, setPin } from "../src/data/adminLock";

describe("admin lock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is off until a PIN is set", () => {
    expect(isPinSet()).toBe(false);
  });

  it("accepts only four-digit PINs", async () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    await expect(setPin("12345")).rejects.toThrow("4 digits");
  });

  it("stores a salted hash, never the PIN", async () => {
    await setPin("2468");
    expect(isPinSet()).toBe(true);
    const stored = Object.values({ ...localStorage }).join(" ");
    expect(stored).not.toContain("2468");
  });

  it("checks the PIN", async () => {
    await setPin("2468");
    expect(await checkPin("2468")).toEqual({ ok: true });
    expect(await checkPin("1357")).toEqual({ ok: false, lockedFor: 0 });
  });

  it("locks the keypad after five wrong guesses, doubling each time", async () => {
    await setPin("2468");
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(await checkPin("0000", t)).toEqual({ ok: false, lockedFor: 0 });
    expect(await checkPin("0000", t)).toEqual({ ok: false, lockedFor: 30_000 });
    expect(lockoutRemaining(t + 10_000)).toBe(20_000);
    // Even the right PIN waits out the lockout.
    expect(await checkPin("2468", t + 10_000)).toEqual({ ok: false, lockedFor: 20_000 });
    expect(await checkPin("0000", t + 30_000)).toEqual({ ok: false, lockedFor: 60_000 });
    expect(await checkPin("2468", t + 90_000)).toEqual({ ok: true });
    // A correct PIN clears the count.
    expect(await checkPin("0000", t + 90_000)).toEqual({ ok: false, lockedFor: 0 });
  });

  it("caps the lockout at fifteen minutes", async () => {
    await setPin("2468");
    let t = 0;
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const result = await checkPin("0000", t);
      if (!result.ok) last = result.lockedFor;
      t += last + 1;
    }
    expect(last).toBe(15 * 60_000);
  });

  it("turns off and forgets attempts", async () => {
    await setPin("2468");
    await checkPin("0000");
    clearPin();
    expect(isPinSet()).toBe(false);
    expect(lockoutRemaining()).toBe(0);
  });
});
