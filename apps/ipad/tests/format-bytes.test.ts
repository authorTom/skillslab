import { describe, it, expect } from "vitest";
import { formatBytes, formatDate } from "../src/data/format";

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });

  it("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("formatDate", () => {
  it("formats an ISO date in British style", () => {
    expect(formatDate("2026-09-30T10:20:30.000Z")).toBe("30 September 2026");
  });

  it("returns text that isn't a date unchanged", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});
