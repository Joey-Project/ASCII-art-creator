import { describe, expect, it } from "vitest";
import { mosaicToSvg, mosaicToText } from "../../src/core/exporters";
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
});

function makeCell(glyph: string): Mosaic["cells"][number] {
  return {
    glyph,
    fontFamily: "monospace",
    fontLabel: "Monospace",
    weight: 400,
    foreground: "#000000",
    background: "#ffffff",
    sourceColor: "#000000",
    density: 0.5,
  };
}
