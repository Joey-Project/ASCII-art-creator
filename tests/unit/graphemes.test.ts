import { describe, expect, it } from "vitest";
import {
  combineGlyphSources,
  isAsciiGrapheme,
  segmentGraphemes,
  uniqueGraphemes,
} from "../../src/core/graphemes";

describe("graphemes", () => {
  it("keeps emoji and combining glyphs as grapheme candidates", () => {
    expect(segmentGraphemes("A🙂❤️")).toEqual(["A", "🙂", "❤️"]);
  });

  it("deduplicates while preserving order", () => {
    expect(uniqueGraphemes("aab🙂🙂b")).toEqual(["a", "b", "🙂"]);
  });

  it("detects ASCII-only glyphs", () => {
    expect(isAsciiGrapheme("A")).toBe(true);
    expect(isAsciiGrapheme("中")).toBe(false);
  });

  it("combines multiple glyph sources", () => {
    expect(combineGlyphSources(["abc", "cde"])).toEqual(["a", "b", "c", "d", "e"]);
  });
});
