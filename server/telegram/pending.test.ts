import { describe, expect, it } from "vitest";
import { addDays } from "./pending";

describe("telegram pending helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-08-30", 1)).toBe("2026-08-31");
    expect(addDays("2026-08-30", 0)).toBe("2026-08-30");
  });

  it("handles negative days", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
