import type {
  ColorStrategy,
  GlyphCandidate,
  RenderSettings,
  SourceCellFeature,
} from "../domain/types";

export function colorForCell(
  settings: RenderSettings,
  strategy: ColorStrategy,
  cell: SourceCellFeature,
  candidate: GlyphCandidate,
): string {
  if (settings.colorMode === "mono") {
    return settings.foreground;
  }

  switch (strategy) {
    case "source":
      return cell.sourceColor;
    case "uniform":
      return settings.foreground;
    case "glyph":
      return colorFromString(candidate.glyph);
    case "font":
      return colorFromString(candidate.fontFamily);
    case "glyph-font":
      return colorFromString(`${candidate.glyph}:${candidate.fontFamily}:${candidate.weight}`);
    default:
      return settings.foreground;
  }
}

export function colorFromString(input: string): string {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 50 + (hash % 22);
  const lightness = 32 + ((hash >> 8) % 26);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function rgbToHex(red: number, green: number, blue: number): string {
  const parts = [red, green, blue].map((value) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}
