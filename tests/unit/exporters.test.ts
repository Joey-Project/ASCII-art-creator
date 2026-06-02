import { describe, expect, it } from "vitest";
import {
  assertSvgFontsExportable,
  mosaicForCanvasExport,
  mosaicToSvg,
  mosaicToText,
  validateExportSize,
} from "../../src/core/exporters";
import type { Mosaic } from "../../src/domain/types";

const mosaic: Mosaic = {
  columns: 2,
  rows: 2,
  cellWidth: 10,
  cellHeight: 12,
  fontSize: 10,
  background: "#ffffff",
  transparentBackground: false,
  candidateCount: 2,
  sourceName: "unit",
  cells: [makeCell("A"), makeCell("&"), makeCell("<"), makeCell(">")],
};

describe("exporters", () => {
  it("exports text rows", () => {
    expect(mosaicToText(mosaic)).toBe("A&\n<>\n");
  });

  it("escapes SVG text content", () => {
    const svg = mosaicToSvg(mosaic);
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;");
    expect(svg).toContain("&gt;");
  });

  it("embeds uploaded fonts in SVG output", () => {
    const svg = mosaicToSvg({
      ...mosaic,
      cells: [
        {
          ...makeCell("A"),
          fontFamily: "Uploaded Demo",
          fontDataUrl: "data:font/woff2;base64,AAAA",
        },
      ],
    });
    expect(svg).toContain("@font-face");
    expect(svg).toContain("Uploaded Demo");
    expect(svg).toContain("data:font/woff2;base64,AAAA");
  });

  it("rejects SVG export for local fonts that cannot be embedded", () => {
    expect(() =>
      assertSvgFontsExportable({
        ...mosaic,
        cells: [
          {
            ...makeCell("A"),
            fontFamily: "Local Demo",
            fontLabel: "Local Demo",
            fontSource: "local",
          },
        ],
      }),
    ).toThrow(/Local Font Access fonts/);
  });

  it("reports normal raster export dimensions", () => {
    expect(validateExportSize(mosaic, 2)).toEqual({ width: 40, height: 48, pixels: 1920 });
  });

  it("rejects oversized raster export dimensions", () => {
    expect(() =>
      validateExportSize(
        {
          ...mosaic,
          columns: 180,
          rows: 180,
          cellWidth: 28,
          cellHeight: 36,
        },
        6,
      ),
    ).toThrow(/Export is too large/);
  });

  it("flattens transparent JPEG exports to white cell backgrounds", () => {
    const flattened = mosaicForCanvasExport(
      {
        ...mosaic,
        background: "#123456",
        transparentBackground: true,
        cells: mosaic.cells.map((cell) => ({ ...cell, background: "#123456" })),
      },
      "image/jpeg",
    );

    expect(flattened.transparentBackground).toBe(false);
    expect(flattened.background).toBe("#ffffff");
    expect(flattened.cells.every((cell) => cell.background === "#ffffff")).toBe(true);
  });
});

function makeCell(glyph: string): Mosaic["cells"][number] {
  return {
    glyph,
    fontFamily: "monospace",
    fontLabel: "Monospace",
    fontSource: "builtin",
    weight: 400,
    foreground: "#000000",
    background: "#ffffff",
    sourceColor: "#000000",
    density: 0.5,
  };
}
