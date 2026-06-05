import { describe, expect, it } from "vitest";
import { colorAwareCandidateScore, colorDistance, colorFromString } from "../../src/core/colors";
import { FeatureIndex } from "../../src/core/feature-index";
import { emptyFeature, featureDistance } from "../../src/core/features";
import type {
  ColorStrategy,
  GlyphCandidate,
  RenderSettings,
  SourceCellFeature,
} from "../../src/domain/types";

const baseSettings: RenderSettings = {
  gridMode: "dimensions",
  columns: 2,
  rows: 1,
  sourcePixelsPerGlyph: 12,
  cellWidth: 12,
  cellHeight: 16,
  fontSize: 14,
  outputScale: 2,
  colorMode: "color",
  colorStrategy: "glyph",
  colorInfluence: 1,
  foreground: "#111111",
  background: "#ffffff",
  transparentBackground: false,
  useDithering: false,
  useEdgeMatching: false,
  densityWindow: 20,
};

describe("color-aware candidate scoring", () => {
  it("measures generated HSL colors against sampled source hex colors", () => {
    expect(colorDistance(colorFromString("A"), "#828c18")).toBeLessThan(0.01);
    expect(colorDistance(colorFromString("####"), "#828c18")).toBeGreaterThan(0.35);
  });

  it("penalizes grouped candidate colors that are far from the source average", () => {
    const cell = makeCell("#828c18");
    const close = makeCandidate("A", 0.5);
    const far = makeCandidate("####", 0.5);

    expect(colorScore("glyph", cell, close, 0.05)).toBeLessThan(colorScore("glyph", cell, far, 0));
  });

  it("can disable color influence for recolorable candidates", () => {
    const cell = makeCell("#828c18");
    const far = makeCandidate("####", 0.5);
    const featureScore = 0.23;
    const featureOnlySettings = { ...baseSettings, colorInfluence: 0 };

    expect(colorAwareCandidateScore(featureOnlySettings, "source", cell, far, featureScore)).toBe(
      featureScore,
    );
    expect(colorAwareCandidateScore(featureOnlySettings, "uniform", cell, far, featureScore)).toBe(
      featureScore,
    );
  });

  it("uses projected source color to recover saturation by glyph density", () => {
    const cell = makeCell("#008040");
    const sparse = makeCandidate(".", 0.15);
    const dense = makeCandidate("#", 0.75);

    expect(colorScore("source", cell, dense, 0.08)).toBeLessThan(
      colorScore("source", cell, sparse, 0),
    );
  });

  it("uses intrinsic colored glyph color even for source and uniform strategies", () => {
    const cell = makeCell("#00cc44");
    const close = makeCandidate("🟢", 0.5, {
      intrinsicColor: "#00c846",
      intrinsicColorStrength: 1,
    });
    const far = makeCandidate("🔴", 0.5, {
      intrinsicColor: "#e21a1a",
      intrinsicColorStrength: 1,
    });

    expect(colorScore("source", cell, close, 0.05)).toBeLessThan(
      colorScore("source", cell, far, 0),
    );
    expect(colorScore("uniform", cell, close, 0.05)).toBeLessThan(
      colorScore("uniform", cell, far, 0),
    );
  });

  it("weights weak intrinsic colors in source and uniform strategies", () => {
    const cell = makeCell("#00cc44");
    const weakIntrinsic = makeCandidate("◒", 0.5, {
      intrinsicColor: "#c04040",
      intrinsicColorStrength: 0.2,
    });
    const strongIntrinsic = makeCandidate("🔴", 0.5, {
      intrinsicColor: "#c04040",
      intrinsicColorStrength: 1,
    });
    const featureScore = 0.1;
    const sourcePenalty = colorDistance(cell.sourceColor, "#93d8a1") * 1.45;
    const uniformPenalty = colorDistance(cell.sourceColor, "#9a8d8d") * 1.45;

    expect(colorScore("source", cell, weakIntrinsic, featureScore)).toBeCloseTo(
      featureScore + sourcePenalty,
    );
    expect(colorScore("uniform", cell, weakIntrinsic, featureScore)).toBeCloseTo(
      featureScore + uniformPenalty,
    );
    expect(colorScore("source", cell, weakIntrinsic, featureScore)).toBeLessThan(
      colorScore("source", cell, strongIntrinsic, featureScore),
    );
  });

  it("scales the color penalty with color influence", () => {
    const cell = makeCell("#828c18");
    const far = makeCandidate("####", 0.5);
    const featureScore = 0.07;
    const featureOnlyScore = colorAwareCandidateScore(
      { ...baseSettings, colorInfluence: 0 },
      "glyph",
      cell,
      far,
      featureScore,
    );
    const normalScore = colorAwareCandidateScore(
      { ...baseSettings, colorInfluence: 1 },
      "glyph",
      cell,
      far,
      featureScore,
    );
    const strongScore = colorAwareCandidateScore(
      { ...baseSettings, colorInfluence: 2 },
      "glyph",
      cell,
      far,
      featureScore,
    );

    expect(featureOnlyScore).toBe(featureScore);
    expect(normalScore - featureScore).toBeGreaterThan(0);
    expect(strongScore - featureScore).toBeCloseTo((normalScore - featureScore) * 2);
  });

  it("lets intrinsic glyph color override grouped generated colors", () => {
    const cell = makeCell("#828c18");
    const generatedFarIntrinsicClose = makeCandidate("####", 0.5, {
      intrinsicColor: "#828c18",
      intrinsicColorStrength: 1,
    });
    const generatedFar = makeCandidate("####", 0.5);

    expect(colorScore("glyph", cell, generatedFarIntrinsicClose, 0.05)).toBeLessThan(
      colorScore("glyph", cell, generatedFar, 0),
    );
  });

  it("can choose a slightly weaker feature match when grouped color is closer", () => {
    const target = { ...emptyFeature(), density: 0.5 };
    const featureOnlyWinner = makeCandidate("####", 0.5);
    const colorWinner = makeCandidate("A", 0.51);
    const cell = makeCell("#828c18", target);
    const index = new FeatureIndex([featureOnlyWinner, colorWinner]);

    expect(featureDistance(target, colorWinner.features, false)).toBeGreaterThan(
      featureDistance(target, featureOnlyWinner.features, false),
    );
    expect(
      index.query(target, {
        densityWindow: 20,
        useEdgeMatching: false,
        scoreCandidate: (candidate, featureScore) =>
          colorAwareCandidateScore(baseSettings, "glyph", cell, candidate, featureScore),
      }).glyph,
    ).toBe("A");
  });
});

function colorScore(
  strategy: ColorStrategy,
  cell: SourceCellFeature,
  candidate: GlyphCandidate,
  featureScore: number,
): number {
  return colorAwareCandidateScore(baseSettings, strategy, cell, candidate, featureScore);
}

function makeCell(sourceColor: string, features = emptyFeature()): SourceCellFeature {
  return {
    x: 0,
    y: 0,
    sourceColor,
    features,
  };
}

function makeCandidate(
  glyph: string,
  density: number,
  overrides: Partial<GlyphCandidate> = {},
): GlyphCandidate {
  return {
    id: glyph,
    glyph,
    fontFamily: "monospace",
    fontLabel: "Monospace",
    fontSource: "builtin",
    weight: 400,
    features: { ...emptyFeature(), density },
    ...overrides,
  };
}
