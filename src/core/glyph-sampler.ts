import type { FontChoice, GlyphCandidate, ProgressCallback, RenderSettings } from "../domain/types";
import { FEATURE_SIZE, extractFeatureFromDarkness } from "./features";
import { canvasFont } from "./canvas";

export async function buildGlyphCandidates(
  glyphs: string[],
  fonts: FontChoice[],
  settings: RenderSettings,
  onProgress?: ProgressCallback,
): Promise<GlyphCandidate[]> {
  const selectedFonts = fonts.filter((font) => font.selected);
  const total = glyphs.length * selectedFonts.reduce((sum, font) => sum + font.weights.length, 0);
  const candidates: GlyphCandidate[] = [];
  let completed = 0;

  for (const font of selectedFonts) {
    await waitForFont(font.family, settings.fontSize);

    for (const weight of font.weights) {
      for (const glyph of glyphs) {
        const candidate = renderGlyphCandidate(glyph, font, weight);
        completed += 1;

        if (candidate.features.density > 0.002 || glyph === " ") {
          candidates.push(candidate);
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

function renderGlyphCandidate(glyph: string, font: FontChoice, weight: number): GlyphCandidate {
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
  context.font = canvasFont(weight, Math.round(FEATURE_SIZE * 0.92), font.family);
  context.fillText(glyph, FEATURE_SIZE / 2, FEATURE_SIZE / 2 + FEATURE_SIZE * 0.04);

  const imageData = context.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  const values = new Float32Array(FEATURE_SIZE * FEATURE_SIZE);

  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    values[index] = imageData.data[offset + 3] / 255;
  }

  return {
    id: `${glyph}:${font.id}:${weight}`,
    glyph,
    fontFamily: font.family,
    fontLabel: font.label,
    weight,
    features: extractFeatureFromDarkness(values),
  };
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
