import type {
  ColorStrategy,
  GlyphCandidate,
  RenderSettings,
  SourceCellFeature,
} from "../domain/types";

const COLOR_AWARE_SELECTION_WEIGHT = 1.45;
const FULL_INTRINSIC_COLOR_STRENGTH = 0.85;
const stringColorCache = new Map<string, string>();
const rgbCache = new Map<string, RgbColor | null>();

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

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

export function colorAwareCandidateScore(
  settings: RenderSettings,
  strategy: ColorStrategy,
  cell: SourceCellFeature,
  candidate: GlyphCandidate,
  featureScore: number,
): number {
  const selectionColor = colorForCandidateSelection(settings, strategy, candidate);
  if (!selectionColor) {
    return featureScore;
  }

  return (
    featureScore +
    colorDistance(cell.sourceColor, selectionColor.color) *
      COLOR_AWARE_SELECTION_WEIGHT *
      selectionColor.weight
  );
}

export function colorFromString(input: string): string {
  const cached = stringColorCache.get(input);
  if (cached) {
    return cached;
  }

  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 50 + (hash % 22);
  const lightness = 32 + ((hash >> 8) % 26);
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
  stringColorCache.set(input, color);
  return color;
}

export function colorDistance(first: string, second: string): number {
  const firstRgb = parseColor(first);
  const secondRgb = parseColor(second);
  if (!firstRgb || !secondRgb) {
    return 0;
  }

  const red = (firstRgb.red - secondRgb.red) / 255;
  const green = (firstRgb.green - secondRgb.green) / 255;
  const blue = (firstRgb.blue - secondRgb.blue) / 255;
  return Math.sqrt(red * red + green * green + blue * blue) / Math.sqrt(3);
}

export function rgbToHex(red: number, green: number, blue: number): string {
  const parts = [red, green, blue].map((value) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

interface CandidateSelectionColor {
  color: string;
  weight: number;
}

function colorForCandidateSelection(
  settings: RenderSettings,
  strategy: ColorStrategy,
  candidate: GlyphCandidate,
): CandidateSelectionColor | null {
  if (settings.colorMode === "mono") {
    return null;
  }

  const intrinsicColor = candidate.intrinsicColor;
  const intrinsicStrength = Math.max(0, Math.min(1, candidate.intrinsicColorStrength ?? 0));
  const assignedColor = assignedCandidateColor(strategy, candidate);

  if (intrinsicColor && intrinsicStrength > 0) {
    if (!assignedColor) {
      return {
        color: intrinsicColor,
        weight: intrinsicStrength >= FULL_INTRINSIC_COLOR_STRENGTH ? 1 : intrinsicStrength,
      };
    }

    if (intrinsicStrength >= FULL_INTRINSIC_COLOR_STRENGTH) {
      return {
        color: intrinsicColor,
        weight: 1,
      };
    }

    return {
      color: blendColors(assignedColor, intrinsicColor, intrinsicStrength),
      weight: 1,
    };
  }

  return assignedColor
    ? {
        color: assignedColor,
        weight: 1,
      }
    : null;
}

function assignedCandidateColor(strategy: ColorStrategy, candidate: GlyphCandidate): string | null {
  switch (strategy) {
    case "glyph":
      return colorFromString(candidate.glyph);
    case "font":
      return colorFromString(candidate.fontFamily);
    case "glyph-font":
      return colorFromString(`${candidate.glyph}:${candidate.fontFamily}:${candidate.weight}`);
    case "source":
    case "uniform":
    default:
      return null;
  }
}

function blendColors(first: string, second: string, amount: number): string {
  const firstRgb = parseColor(first);
  const secondRgb = parseColor(second);
  if (!firstRgb || !secondRgb) {
    return second;
  }

  const blend = clamp01(amount);
  return rgbToHex(
    firstRgb.red * (1 - blend) + secondRgb.red * blend,
    firstRgb.green * (1 - blend) + secondRgb.green * blend,
    firstRgb.blue * (1 - blend) + secondRgb.blue * blend,
  );
}

function parseColor(color: string): RgbColor | null {
  const cached = rgbCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const parsed = parseHexColor(color) ?? parseHslColor(color);
  rgbCache.set(color, parsed);
  return parsed;
}

function parseHexColor(color: string): RgbColor | null {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function parseHslColor(color: string): RgbColor | null {
  const match = color
    .trim()
    .match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*\)$/i);
  if (!match) {
    return null;
  }

  const hue = (((Number(match[1]) % 360) + 360) % 360) / 360;
  const saturation = clamp01(Number(match[2]) / 100);
  const lightness = clamp01(Number(match[3]) / 100);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue * 6;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [red1, green1, blue1] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const matchLightness = lightness - chroma / 2;

  return {
    red: (red1 + matchLightness) * 255,
    green: (green1 + matchLightness) * 255,
    blue: (blue1 + matchLightness) * 255,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
