import type {
  FontChoice,
  FontSource,
  GlyphCandidate,
  ProgressCallback,
  RenderSettings,
} from "../domain/types";
import { FEATURE_SIZE, clamp01, extractFeatureFromDarkness } from "./features";
import { canvasFont } from "./canvas";
import { isAsciiGrapheme } from "./graphemes";
import { rgbToHex } from "./colors";

const MISSING_GLYPH_SENTINELS = ["\u{10ffff}", "\uffff", "\ufffe"];
const FALLBACK_FAMILIES = ["sans-serif", "serif", "monospace"];
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
]);
const INTRINSIC_COLOR_PROBE = "#ff00ff";
const FULL_INTRINSIC_COLOR_STRENGTH = 0.85;
const MIN_INTRINSIC_VISIBLE_ALPHA = 0.01;
const MIN_INTRINSIC_COLOR_STRENGTH = 0.08;
const MAX_NATIVE_RECOLOR_DELTA = 0.08;
const fallbackSignatureCache = new Map<string, Set<string>>();

export interface IntrinsicGlyphColor {
  color: string;
  strength: number;
}

interface RenderedGlyph {
  candidate: GlyphCandidate;
  signature: string;
}

export async function buildGlyphCandidates(
  glyphs: string[],
  fonts: FontChoice[],
  settings: RenderSettings,
  onProgress?: ProgressCallback,
): Promise<GlyphCandidate[]> {
  const selectedFonts = fonts.filter((font) => font.selected);
  const total = glyphs.length * selectedFonts.reduce((sum, font) => sum + font.weights.length, 0);
  const candidates: GlyphCandidate[] = [];
  const sampleFontSize = glyphFeatureFontSize(settings);
  let completed = 0;

  for (const font of selectedFonts) {
    await waitForFont(font.family, sampleFontSize);

    for (const weight of font.weights) {
      const missingGlyphSignatures = new Set(
        MISSING_GLYPH_SENTINELS.map(
          (sentinel) => renderGlyphCandidate(sentinel, font, weight, sampleFontSize).signature,
        ),
      );

      for (const glyph of glyphs) {
        const rendered = renderGlyphCandidate(glyph, font, weight, sampleFontSize);
        completed += 1;

        if (
          isRenderableGlyph(glyph, font, weight, sampleFontSize, rendered, missingGlyphSignatures)
        ) {
          candidates.push(rendered.candidate);
        }

        if (completed % 64 === 0) {
          onProgress?.({
            phase: "glyphs",
            completed,
            total,
            message: `Rendered ${completed.toLocaleString()} of ${total.toLocaleString()} glyph samples`,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
    }
  }

  onProgress?.({
    phase: "glyphs",
    completed: total,
    total,
    message: `Indexed ${candidates.length.toLocaleString()} renderable glyph samples`,
  });

  return candidates;
}

export function glyphFeatureFontSize(
  settings: Pick<RenderSettings, "fontSize" | "cellHeight">,
): number {
  const cellHeight = Math.max(1, settings.cellHeight);
  const scaledFontSize = (settings.fontSize / cellHeight) * FEATURE_SIZE;
  return clampInteger(Math.round(scaledFontSize), 4, Math.round(FEATURE_SIZE * 2.5));
}

function renderGlyphCandidate(
  glyph: string,
  font: FontChoice,
  weight: number,
  sampleFontSize: number,
): RenderedGlyph {
  return renderGlyphWithFamily(
    glyph,
    font.family,
    font.label,
    font.id,
    weight,
    sampleFontSize,
    font.source,
    font.dataUrl,
  );
}

function renderGlyphWithFamily(
  glyph: string,
  family: string,
  fontLabel: string,
  fontId: string,
  weight: number,
  sampleFontSize: number,
  fontSource: FontSource,
  fontDataUrl?: string,
): RenderedGlyph {
  const imageData = renderGlyphImageData(glyph, family, weight, sampleFontSize, "#000000");
  const values = new Float32Array(FEATURE_SIZE * FEATURE_SIZE);
  const signatureBits: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    values[index] = imageData.data[offset + 3] / 255;
    signatureBits.push(values[index] > 0.02 ? "1" : "0");
  }

  const initialIntrinsicColor = measureIntrinsicGlyphColor(imageData.data);
  const intrinsicColor =
    initialIntrinsicColor && initialIntrinsicColor.strength >= FULL_INTRINSIC_COLOR_STRENGTH
      ? initialIntrinsicColor
      : measureIntrinsicGlyphColor(
          imageData.data,
          renderGlyphImageData(glyph, family, weight, sampleFontSize, INTRINSIC_COLOR_PROBE).data,
        );

  return {
    candidate: {
      id: `${glyph}:${fontId}:${weight}`,
      glyph,
      fontFamily: family,
      fontLabel,
      fontSource,
      fontDataUrl,
      weight,
      features: extractFeatureFromDarkness(values),
      intrinsicColor: intrinsicColor?.color,
      intrinsicColorStrength: intrinsicColor?.strength,
    },
    signature: signatureBits.join(""),
  };
}

function renderGlyphImageData(
  glyph: string,
  family: string,
  weight: number,
  sampleFontSize: number,
  fillStyle: string,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = FEATURE_SIZE;
  canvas.height = FEATURE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D glyph sampling is not available");
  }

  context.clearRect(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  context.fillStyle = fillStyle;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = canvasFont(weight, sampleFontSize, family);
  context.fillText(glyph, FEATURE_SIZE / 2, FEATURE_SIZE / 2 + FEATURE_SIZE * 0.04);
  return context.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE);
}

export function measureIntrinsicGlyphColor(
  data: Uint8ClampedArray,
  recolorProbeData?: Uint8ClampedArray,
): IntrinsicGlyphColor | null {
  const sample = summarizeVisibleColor(data);
  if (!sample) {
    return null;
  }

  const directStrength = Math.max(sample.luminanceSignal, sample.chromaSignal);
  if (directStrength >= FULL_INTRINSIC_COLOR_STRENGTH) {
    return {
      color: sample.color,
      strength: clamp01(directStrength),
    };
  }

  const recolorProbe = recolorProbeData ? summarizeVisibleColor(recolorProbeData) : null;
  if (recolorProbe && colorDelta(sample, recolorProbe) <= MAX_NATIVE_RECOLOR_DELTA) {
    return {
      color: sample.color,
      strength: 1,
    };
  }

  if (directStrength >= MIN_INTRINSIC_COLOR_STRENGTH) {
    return {
      color: sample.color,
      strength: clamp01(directStrength),
    };
  }

  return null;
}

interface VisibleColorSummary {
  red: number;
  green: number;
  blue: number;
  color: string;
  luminanceSignal: number;
  chromaSignal: number;
}

function summarizeVisibleColor(data: Uint8ClampedArray): VisibleColorSummary | null {
  let alphaSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let luminanceSignal = 0;
  let chromaSignal = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    if (alpha <= 0) {
      continue;
    }

    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);

    alphaSum += alpha;
    redSum += red * alpha;
    greenSum += green * alpha;
    blueSum += blue * alpha;
    luminanceSignal += ((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255) * alpha;
    chromaSignal += ((max - min) / 255) * alpha;
  }

  const pixelCount = data.length / 4;
  if (pixelCount === 0 || alphaSum / pixelCount < MIN_INTRINSIC_VISIBLE_ALPHA) {
    return null;
  }

  const red = redSum / alphaSum;
  const green = greenSum / alphaSum;
  const blue = blueSum / alphaSum;

  return {
    color: rgbToHex(red, green, blue),
    red,
    green,
    blue,
    luminanceSignal: luminanceSignal / alphaSum,
    chromaSignal: chromaSignal / alphaSum,
  };
}

function colorDelta(first: VisibleColorSummary, second: VisibleColorSummary): number {
  const red = (first.red - second.red) / 255;
  const green = (first.green - second.green) / 255;
  const blue = (first.blue - second.blue) / 255;
  return Math.sqrt(red * red + green * green + blue * blue) / Math.sqrt(3);
}

function isRenderableGlyph(
  glyph: string,
  font: FontChoice,
  weight: number,
  sampleFontSize: number,
  rendered: RenderedGlyph,
  missingGlyphSignatures: Set<string>,
): boolean {
  if (glyph === " ") {
    return true;
  }

  if (rendered.candidate.features.density <= 0.002) {
    return false;
  }

  if (missingGlyphSignatures.has(rendered.signature)) {
    return false;
  }

  if (
    shouldFilterAgainstFallbackSignatures(glyph, font) &&
    fallbackSignaturesFor(glyph, weight, sampleFontSize).has(rendered.signature)
  ) {
    return false;
  }

  return true;
}

export function shouldFilterAgainstFallbackSignatures(
  glyph: string,
  font: Pick<FontChoice, "family" | "source">,
): boolean {
  if (isAsciiGrapheme(glyph) || font.source === "local") {
    return false;
  }

  return !GENERIC_FAMILIES.has(font.family);
}

function fallbackSignaturesFor(glyph: string, weight: number, sampleFontSize: number): Set<string> {
  const cacheKey = `${glyph}:${weight}:${sampleFontSize}`;
  const cached = fallbackSignatureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const signatures = new Set(
    FALLBACK_FAMILIES.map(
      (family) =>
        renderGlyphWithFamily(
          glyph,
          family,
          family,
          `fallback-${family}`,
          weight,
          sampleFontSize,
          "builtin",
        ).signature,
    ),
  );
  fallbackSignatureCache.set(cacheKey, signatures);
  return signatures;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

async function waitForFont(family: string, size: number): Promise<void> {
  if (!("fonts" in document)) {
    return;
  }

  try {
    await document.fonts.load(`${size}px ${family}`);
  } catch {
    return;
  }
}
