import { describe, expect, it } from "vitest";
import {
  glyphFeatureFontSize,
  measureIntrinsicGlyphColor,
  shouldProbeIntrinsicGlyphColor,
  shouldFilterAgainstFallbackSignatures,
} from "../../src/core/glyph-sampler";

describe("glyph sampler", () => {
  it("maps UI font size onto the normalized glyph feature canvas", () => {
    expect(glyphFeatureFontSize({ fontSize: 14, cellHeight: 16 })).toBe(16);
    expect(glyphFeatureFontSize({ fontSize: 28, cellHeight: 14 })).toBe(36);
  });

  it("clamps extreme feature sampling sizes", () => {
    expect(glyphFeatureFontSize({ fontSize: 1, cellHeight: 100 })).toBe(4);
    expect(glyphFeatureFontSize({ fontSize: 100, cellHeight: 1 })).toBe(45);
  });

  it("keeps ASCII and local-font glyphs out of generic fallback filtering", () => {
    expect(shouldFilterAgainstFallbackSignatures("A", { family: "Arial", source: "builtin" })).toBe(
      false,
    );
    expect(shouldFilterAgainstFallbackSignatures("中", { family: "Arial", source: "local" })).toBe(
      false,
    );
    expect(
      shouldFilterAgainstFallbackSignatures("中", { family: "Uploaded Demo", source: "uploaded" }),
    ).toBe(true);
    expect(
      shouldFilterAgainstFallbackSignatures("中", { family: "sans-serif", source: "builtin" }),
    ).toBe(false);
  });

  it("ignores monochrome black glyph samples as intrinsic color", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(measureIntrinsicGlyphColor(data)).toBeNull();
  });

  it("keeps dark native colors when probe rendering does not recolor the glyph", () => {
    const darkNative = new Uint8ClampedArray([5, 5, 5, 255, 8, 8, 8, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
    const darkProbe = new Uint8ClampedArray([6, 6, 6, 255, 9, 9, 9, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
    const measured = measureIntrinsicGlyphColor(darkNative, darkProbe);

    expect(measured).not.toBeNull();
    expect(measured?.color).toBe("#060606");
    expect(measured?.strength).toBe(1);
  });

  it("upgrades weak native colors when the probe render does not recolor the glyph", () => {
    const weakNative = new Uint8ClampedArray([
      45, 30, 30, 255, 55, 35, 35, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const weakProbe = new Uint8ClampedArray([
      47, 31, 31, 255, 57, 36, 36, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    expect(measureIntrinsicGlyphColor(weakNative)?.strength).toBeLessThan(0.85);
    expect(measureIntrinsicGlyphColor(weakNative, weakProbe)?.strength).toBe(1);
  });

  it("ignores weak recolorable samples when the probe render changes color", () => {
    const weakRecolorable = new Uint8ClampedArray([
      45, 30, 30, 255, 55, 35, 35, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const recoloredProbe = new Uint8ClampedArray([
      255, 0, 255, 255, 255, 0, 255, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    expect(measureIntrinsicGlyphColor(weakRecolorable)?.strength).toBeLessThan(0.85);
    expect(measureIntrinsicGlyphColor(weakRecolorable, recoloredProbe)).toBeNull();
  });

  it("ignores recolorable dark glyphs when the probe render changes color", () => {
    const blackSample = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
    const recoloredProbe = new Uint8ClampedArray([
      255, 0, 255, 255, 255, 0, 255, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    expect(measureIntrinsicGlyphColor(blackSample, recoloredProbe)).toBeNull();
  });

  it("measures alpha-weighted intrinsic color from rendered samples", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
    const measured = measureIntrinsicGlyphColor(data);

    expect(measured).not.toBeNull();
    expect(measured?.color).toBe("#aa0055");
    expect(measured?.strength).toBeGreaterThan(0.6);
  });

  it("limits probe renders to plausible intrinsic-color cases", () => {
    expect(shouldProbeIntrinsicGlyphColor("A", null)).toBe(false);
    expect(shouldProbeIntrinsicGlyphColor("🖤", null)).toBe(true);
    expect(shouldProbeIntrinsicGlyphColor("A", { color: "#402020", strength: 0.2 })).toBe(true);
    expect(shouldProbeIntrinsicGlyphColor("A", { color: "#ff0000", strength: 0.95 })).toBe(false);
  });
});
