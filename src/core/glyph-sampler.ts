import type {
  FontChoice,
  FontSource,
  GlyphCandidate,
  ProgressCallback,
  RenderSettings,
} from "../domain/types";
import { FEATURE_SIZE, extractFeatureFromDarkness } from "./features";
import { canvasFont } from "./canvas";

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
const fallbackSignatureCache = new Map<string, Set<string>>();

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
  const canvas = document.createElement("canvas");
  canvas.width = FEATURE_SIZE;
  canvas.height = FEATURE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D glyph sampling is not available");
  }

  context.clearRect(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = canvasFont(weight, sampleFontSize, family);
  context.fillText(glyph, FEATURE_SIZE / 2, FEATURE_SIZE / 2 + FEATURE_SIZE * 0.04);

  const imageData = context.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  const values = new Float32Array(FEATURE_SIZE * FEATURE_SIZE);
  const signatureBits: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    values[index] = imageData.data[offset + 3] / 255;
    signatureBits.push(values[index] > 0.02 ? "1" : "0");
  }

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
    },
    signature: signatureBits.join(""),
  };
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
    !GENERIC_FAMILIES.has(font.family) &&
    fallbackSignaturesFor(glyph, weight, sampleFontSize).has(rendered.signature)
  ) {
    return false;
  }

  return true;
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
