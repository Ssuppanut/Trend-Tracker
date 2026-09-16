import { describe, expect, it } from "vitest";

import { cosineSimilarity, meanVector } from "./similarity";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("is -1 for opposite direction", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("is 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on a length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });
});

describe("meanVector", () => {
  it("averages component-wise", () => {
    expect(meanVector([[0, 0], [2, 4]])).toEqual([1, 2]);
  });

  it("returns the vector itself for a single input", () => {
    expect(meanVector([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it("throws on empty input", () => {
    expect(() => meanVector([])).toThrow(/no vectors/);
  });

  it("throws on a length mismatch", () => {
    expect(() => meanVector([[1, 2], [1]])).toThrow(/length mismatch/);
  });
});
