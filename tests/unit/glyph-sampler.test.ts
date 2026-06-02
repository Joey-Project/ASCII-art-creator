import { describe, expect, it } from "vitest";
import { glyphFeatureFontSize } from "../../src/core/glyph-sampler";

describe("glyph sampler", () => {
  it("maps UI font size onto the normalized glyph feature canvas", () => {
    expect(glyphFeatureFontSize({ fontSize: 14, cellHeight: 16 })).toBe(16);
    expect(glyphFeatureFontSize({ fontSize: 28, cellHeight: 14 })).toBe(36);
  });

  it("clamps extreme feature sampling sizes", () => {
    expect(glyphFeatureFontSize({ fontSize: 1, cellHeight: 100 })).toBe(4);
    expect(glyphFeatureFontSize({ fontSize: 100, cellHeight: 1 })).toBe(45);
  });
});
