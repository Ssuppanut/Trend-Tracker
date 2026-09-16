import { describe, expect, it } from "vitest";

import { parseVector, toVectorLiteral } from "./vector";

describe("toVectorLiteral", () => {
  it("serializes to the pgvector bracket literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("round-trips through parseVector", () => {
    const v = [1, -2.5, 0, 3.14];
    expect(parseVector(toVectorLiteral(v))).toEqual(v);
  });
});

describe("parseVector", () => {
  it("parses the pgvector literal string", () => {
    expect(parseVector("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("passes through an already-parsed array", () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("returns null for null / empty / non-array / unparseable input", () => {
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
    expect(parseVector("")).toBeNull();
    expect(parseVector("   ")).toBeNull();
    expect(parseVector("not-json")).toBeNull();
    expect(parseVector("{}")).toBeNull();
    expect(parseVector([])).toBeNull();
    expect(parseVector(42)).toBeNull();
  });

  it("returns null when any element is non-finite", () => {
    expect(parseVector([1, NaN, 3])).toBeNull();
    expect(parseVector(["a", "b"])).toBeNull();
  });
});
