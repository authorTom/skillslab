import { spawnSync } from "child_process";
import path from "path";
import { describe, it, expect } from "vitest";
import { msUntilNext, parseBackupTime } from "../scripts/backup-daily.mjs";

const SCRIPT = path.resolve(__dirname, "..", "scripts", "backup-daily.mjs");

describe("parseBackupTime", () => {
  it("reads 24-hour times", () => {
    expect(parseBackupTime("02:00")).toEqual({ hour: 2, minute: 0 });
    expect(parseBackupTime("2:30")).toEqual({ hour: 2, minute: 30 });
    expect(parseBackupTime(" 23:59 ")).toEqual({ hour: 23, minute: 59 });
  });

  it("refuses anything else", () => {
    for (const bad of ["", "24:00", "12:60", "2am", "02-00", "02:00:00"]) {
      expect(parseBackupTime(bad)).toBeNull();
    }
  });
});

describe("msUntilNext", () => {
  const at = (h: number, m: number) => new Date(2026, 10, 23, h, m, 0, 0);

  it("waits until later today when the time hasn't passed", () => {
    expect(msUntilNext({ hour: 2, minute: 0 }, at(1, 30))).toBe(30 * 60_000);
  });

  it("waits until tomorrow when it has, or is now", () => {
    expect(msUntilNext({ hour: 2, minute: 0 }, at(2, 0))).toBe(24 * 3_600_000);
    expect(msUntilNext({ hour: 2, minute: 0 }, at(18, 0))).toBe(8 * 3_600_000);
  });
});

describe("backup-daily.mjs", () => {
  it("refuses to start with an invalid BACKUP_TIME", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, BACKUP_TIME: "late" },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BACKUP_TIME");
  });
});
