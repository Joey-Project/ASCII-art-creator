import { describe, expect, it } from "vitest";
import { recommendGridForImage, resolveGrid } from "../../src/core/generator";
import type { RenderSettings } from "../../src/domain/types";

const baseSettings: RenderSettings = {
  gridMode: "dimensions",
  columns: 80,
  rows: 40,
  sourcePixelsPerGlyph: 12,
  cellWidth: 12,
  cellHeight: 16,
  fontSize: 14,
  outputScale: 2,
  colorMode: "mono",
  colorStrategy: "source",
  foreground: "#111111",
  background: "#ffffff",
  transparentBackground: false,
  useDithering: true,
  useEdgeMatching: true,
  densityWindow: 10,
};

describe("grid sizing", () => {
  it("uses explicit row and column settings", () => {
    expect(resolveGrid(1200, 800, baseSettings)).toEqual({ columns: 80, rows: 40 });
  });

  it("derives grid size from source pixels per glyph", () => {
    expect(
      resolveGrid(1200, 800, {
        ...baseSettings,
        gridMode: "source-pixels",
        sourcePixelsPerGlyph: 20,
      }),
    ).toEqual({
      columns: 60,
      rows: 40,
    });
  });

  it("recommends a bounded grid from image dimensions", () => {
    const recommendation = recommendGridForImage(1920, 1080);
    expect(recommendation.columns).toBeGreaterThan(32);
    expect(recommendation.rows).toBeGreaterThan(18);
    expect(recommendation.sourcePixelsPerGlyph).toBeGreaterThanOrEqual(4);
  });
});
