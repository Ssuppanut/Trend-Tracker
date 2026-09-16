import { describe, expect, it } from "vitest";

import { buildEmbeddingInput, MAX_INPUT_CHARS } from "./input";

describe("buildEmbeddingInput", () => {
  it("joins title and body with a blank line", () => {
    expect(buildEmbeddingInput({ title: "Hello", body: "World" })).toBe(
      "Hello\n\nWorld",
    );
  });

  it("uses the title alone when body is null or empty", () => {
    expect(buildEmbeddingInput({ title: "Only title", body: null })).toBe(
      "Only title",
    );
    expect(buildEmbeddingInput({ title: "Only title", body: "   " })).toBe(
      "Only title",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(buildEmbeddingInput({ title: "  A  ", body: "  B  " })).toBe("A\n\nB");
  });

  it("caps the result at MAX_INPUT_CHARS", () => {
    const long = "x".repeat(MAX_INPUT_CHARS + 500);
    const out = buildEmbeddingInput({ title: long, body: long });
    expect(out).toHaveLength(MAX_INPUT_CHARS);
  });
});
