import { describe, expect, it } from "vitest";
import { FeatureIndex } from "../../src/core/feature-index";
import { emptyFeature, extractFeatureFromDarkness, featureDistance } from "../../src/core/features";
import type { GlyphCandidate } from "../../src/domain/types";

describe("feature extraction and indexing", () => {
  it("extracts density and quadrant features", () => {
    const values = new Float32Array(18 * 18);
    values.fill(0);
    values[0] = 1;
    values[1] = 1;

    const feature = extractFeatureFromDarkness(values);
    expect(feature.density).toBeGreaterThan(0);
    expect(feature.quadrants[0]).toBeGreaterThan(feature.quadrants[3]);
  });

  it("uses density prefilter and shape distance to choose candidates", () => {
    const light = makeCandidate(" ", 0.05);
    const dark = makeCandidate("#", 0.9);
    const index = new FeatureIndex([light, dark]);

    expect(
      index.query(
        { ...emptyFeature(), density: 0.85 },
        { densityWindow: 20, useEdgeMatching: true },
      ).glyph,
    ).toBe("#");
    expect(
      index.query(
        { ...emptyFeature(), density: 0.02 },
        { densityWindow: 20, useEdgeMatching: true },
      ).glyph,
    ).toBe(" ");
  });

  it("scores closer features lower", () => {
    const target = { ...emptyFeature(), density: 0.5 };
    const near = { ...emptyFeature(), density: 0.52 };
    const far = { ...emptyFeature(), density: 0.9 };

    expect(featureDistance(target, near, false)).toBeLessThan(featureDistance(target, far, false));
  });
});

function makeCandidate(glyph: string, density: number): GlyphCandidate {
  return {
    id: glyph,
    glyph,
    fontFamily: "monospace",
    fontLabel: "Monospace",
    weight: 400,
    features: { ...emptyFeature(), density },
  };
}
