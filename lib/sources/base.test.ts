import { describe, it, expect } from "vitest";

import { percentileRank, truncate } from "./base";

describe("percentileRank", () => {
  it("ranks a value within a normal distribution (0-100)", () => {
    const scores = [10, 20, 30, 40];
    // 30: two below (10, 20), one equal (itself) → (2 + 0.5) / 4 * 100 = 62.5
    expect(percentileRank(30, scores)).toBe(62.5);
    // lowest value stays in range and below the middle
    expect(percentileRank(10, scores)).toBe(12.5);
    // highest value is the top of the range but under 100 (mid-rank)
    expect(percentileRank(40, scores)).toBe(87.5);
    // every result is within 0-100
    for (const s of scores) {
      const p = percentileRank(s, scores);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it("returns 50 when all values are equal", () => {
    expect(percentileRank(5, [5, 5, 5, 5])).toBe(50);
  });

  it("returns 50 for a single item", () => {
    expect(percentileRank(42, [42])).toBe(50);
  });

  it("returns 50 for an empty array", () => {
    expect(percentileRank(42, [])).toBe(50);
  });
});

describe("truncate", () => {
  it("leaves short text unchanged", () => {
    expect(truncate("hello", 2000)).toBe("hello");
  });

  it("cuts long text to maxLength", () => {
    const long = "a".repeat(2500);
    const result = truncate(long, 2000);
    expect(result).toHaveLength(2000);
    expect(result).toBe("a".repeat(2000));
  });

  it("leaves text of exactly maxLength unchanged", () => {
    const exact = "a".repeat(2000);
    expect(truncate(exact, 2000)).toBe(exact);
    expect(truncate(exact, 2000)).toHaveLength(2000);
  });
});
