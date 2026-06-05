import type {
  ColorStrategy,
  GlyphCandidate,
  RenderSettings,
  SourceCellFeature,
} from "../domain/types";

const COLOR_AWARE_SELECTION_WEIGHT = 1.45;
const FULL_INTRINSIC_COLOR_STRENGTH = 0.85;
const DEFAULT_TRANSPARENT_BACKGROUND_COLOR = "#ffffff";
const stringColorCache = new Map<string, string>();
const srgbCache = new Map<string, SrgbColor | null>();
const linearColorCache = new Map<string, LinearRgbColor | null>();
const oklabColorCache = new Map<string, OklabColor | null>();

interface SrgbColor {
  red: number;
  green: number;
  blue: number;
}

interface LinearRgbColor {
  red: number;
  green: number;
  blue: number;
}

interface OklabColor {
  lightness: number;
  a: number;
  b: number;
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
  const colorInfluence = clampColorInfluence(settings.colorInfluence);
  if (colorInfluence === 0) {
    return featureScore;
  }

  const selectionColor = colorForCandidateSelection(settings, strategy, cell, candidate);
  if (!selectionColor) {
    return featureScore;
  }

  return (
    featureScore +
    projectedColorDistance(settings, cell.sourceColor, candidate, selectionColor.linearColor) *
      COLOR_AWARE_SELECTION_WEIGHT *
      colorInfluence *
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
  const firstOklab = oklabColorForString(first);
  const secondOklab = oklabColorForString(second);
  if (!firstOklab || !secondOklab) {
    return 0;
  }

  return oklabDistance(firstOklab, secondOklab);
}

export function rgbToHex(red: number, green: number, blue: number): string {
  const parts = [red, green, blue].map((value) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

export function linearRgbToHex(red: number, green: number, blue: number): string {
  return rgbToHex(
    linearChannelToSrgbByte(red),
    linearChannelToSrgbByte(green),
    linearChannelToSrgbByte(blue),
  );
}

export function linearChannelToSrgbByte(channel: number): number {
  const clamped = clamp01(channel);
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return encoded * 255;
}

export function srgbByteToLinear(value: number): number {
  const channel = clamp01(value / 255);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

interface CandidateSelectionColor {
  linearColor: LinearRgbColor;
  weight: number;
}

function colorForCandidateSelection(
  settings: RenderSettings,
  strategy: ColorStrategy,
  cell: SourceCellFeature,
  candidate: GlyphCandidate,
): CandidateSelectionColor | null {
  if (settings.colorMode === "mono") {
    return null;
  }

  const intrinsicColor = candidate.intrinsicColor;
  const intrinsicStrength = Math.max(0, Math.min(1, candidate.intrinsicColorStrength ?? 0));
  const assignedColor = assignedCandidateColor(settings, strategy, cell, candidate);
  const assignedLinearColor = assignedColor ? linearColorForString(assignedColor) : null;
  const intrinsicLinearColor = intrinsicColor ? linearColorForString(intrinsicColor) : null;

  if (intrinsicLinearColor && intrinsicStrength > 0) {
    if (!assignedLinearColor) {
      return {
        linearColor: intrinsicLinearColor,
        weight: intrinsicStrength >= FULL_INTRINSIC_COLOR_STRENGTH ? 1 : intrinsicStrength,
      };
    }

    if (intrinsicStrength >= FULL_INTRINSIC_COLOR_STRENGTH) {
      return {
        linearColor: intrinsicLinearColor,
        weight: 1,
      };
    }

    return {
      linearColor: blendLinearColors(assignedLinearColor, intrinsicLinearColor, intrinsicStrength),
      weight: 1,
    };
  }

  return assignedLinearColor
    ? {
        linearColor: assignedLinearColor,
        weight: 1,
      }
    : null;
}

function assignedCandidateColor(
  settings: RenderSettings,
  strategy: ColorStrategy,
  cell: SourceCellFeature,
  candidate: GlyphCandidate,
): string | null {
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
      return null;
  }
}

function projectedColorDistance(
  settings: RenderSettings,
  target: string,
  candidate: GlyphCandidate,
  foreground: LinearRgbColor,
): number {
  const background = settings.transparentBackground
    ? DEFAULT_TRANSPARENT_BACKGROUND_COLOR
    : settings.background;
  const targetOklab = oklabColorForString(target);
  const backgroundLinear = linearColorForString(background);
  if (!targetOklab || !backgroundLinear) {
    return 0;
  }

  const projected = linearRgbToOklab(
    blendLinearColors(backgroundLinear, foreground, candidate.features.density),
  );
  return oklabDistance(targetOklab, projected);
}

function blendLinearColors(
  first: LinearRgbColor,
  second: LinearRgbColor,
  amount: number,
): LinearRgbColor {
  const blend = clamp01(amount);
  return {
    red: first.red * (1 - blend) + second.red * blend,
    green: first.green * (1 - blend) + second.green * blend,
    blue: first.blue * (1 - blend) + second.blue * blend,
  };
}

function parseColor(color: string): SrgbColor | null {
  const cached = srgbCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const parsed = parseHexColor(color) ?? parseHslColor(color);
  srgbCache.set(color, parsed);
  return parsed;
}

function linearColorForString(color: string): LinearRgbColor | null {
  const cached = linearColorCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const parsed = parseColor(color);
  const linear = parsed ? srgbToLinearRgb(parsed) : null;
  linearColorCache.set(color, linear);
  return linear;
}

function oklabColorForString(color: string): OklabColor | null {
  const cached = oklabColorCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const linear = linearColorForString(color);
  const oklab = linear ? linearRgbToOklab(linear) : null;
  oklabColorCache.set(color, oklab);
  return oklab;
}

function srgbToLinearRgb(color: SrgbColor): LinearRgbColor {
  return {
    red: srgbByteToLinear(color.red),
    green: srgbByteToLinear(color.green),
    blue: srgbByteToLinear(color.blue),
  };
}

function linearRgbToOklab(color: LinearRgbColor): OklabColor {
  const l = 0.4122214708 * color.red + 0.5363325363 * color.green + 0.0514459929 * color.blue;
  const m = 0.2119034982 * color.red + 0.6806995451 * color.green + 0.1073969566 * color.blue;
  const s = 0.0883024619 * color.red + 0.2817188376 * color.green + 0.6299787005 * color.blue;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    lightness: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabDistance(first: OklabColor, second: OklabColor): number {
  const lightness = first.lightness - second.lightness;
  const a = first.a - second.a;
  const b = first.b - second.b;
  return Math.sqrt(lightness * lightness + a * a + b * b);
}

function parseHexColor(color: string): SrgbColor | null {
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

function parseHslColor(color: string): SrgbColor | null {
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

function clampColorInfluence(value: number): number {
  return Math.max(0, Math.min(2, Number.isFinite(value) ? value : 1));
}
