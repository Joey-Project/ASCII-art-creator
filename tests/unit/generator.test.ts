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
  colorInfluence: 1,
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
      rows: 30,
    });
  });

  it("recommends a bounded grid from image dimensions", () => {
    const recommendation = recommendGridForImage(1920, 1080);
    expect(recommendation.columns).toBeGreaterThan(32);
    expect(recommendation.rows).toBeGreaterThan(18);
    expect(recommendation.sourcePixelsPerGlyph).toBeGreaterThanOrEqual(4);
  });

  it("keeps generated output close to the source aspect ratio", () => {
    const grid = resolveGrid(1920, 1080, {
      ...baseSettings,
      gridMode: "source-pixels",
      sourcePixelsPerGlyph: 16,
    });

    const outputAspect =
      (grid.columns * baseSettings.cellWidth) / (grid.rows * baseSettings.cellHeight);
    expect(outputAspect).toBeCloseTo(1920 / 1080, 1);
  });

  it("preserves source-pixel aspect ratio when large images hit grid bounds", () => {
    const wideGrid = resolveGrid(10_000, 1_000, {
      ...baseSettings,
      gridMode: "source-pixels",
      sourcePixelsPerGlyph: 4,
    });
    const tallGrid = resolveGrid(1_000, 10_000, {
      ...baseSettings,
      gridMode: "source-pixels",
      sourcePixelsPerGlyph: 4,
    });

    const wideAspect =
      (wideGrid.columns * baseSettings.cellWidth) / (wideGrid.rows * baseSettings.cellHeight);
    const tallAspect =
      (tallGrid.columns * baseSettings.cellWidth) / (tallGrid.rows * baseSettings.cellHeight);

    expect(wideGrid.columns).toBe(220);
    expect(wideAspect).toBeCloseTo(10, 0);
    expect(tallGrid.rows).toBe(220);
    expect(tallAspect).toBeCloseTo(0.1, 1);
  });
});
