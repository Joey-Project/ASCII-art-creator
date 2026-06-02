import type {
  FontChoice,
  GenerateProgress,
  Mosaic,
  MosaicCell,
  ProgressCallback,
  RenderSettings,
} from "../domain/types";
import { FeatureIndex } from "./feature-index";
import { clamp01, cloneFeatureWithDensity } from "./features";
import { buildGlyphCandidates } from "./glyph-sampler";
import { colorForCell } from "./colors";
import { extractSourceCellFeatures, type ImageSource } from "./source-image";

export interface GenerateMosaicInput {
  source: ImageSource;
  sourceName: string;
  glyphs: string[];
  fonts: FontChoice[];
  settings: RenderSettings;
  onProgress?: ProgressCallback;
}

export async function generateMosaic(input: GenerateMosaicInput): Promise<Mosaic> {
  const { source, sourceName, glyphs, fonts, settings, onProgress } = input;
  const sourceWidth = "width" in source ? source.width : 1;
  const sourceHeight = "height" in source ? source.height : 1;
  const { columns, rows } = resolveGrid(sourceWidth, sourceHeight, settings);

  progress(onProgress, "glyphs", 0, glyphs.length, "Rendering glyph candidates");
  const candidates = await buildGlyphCandidates(glyphs, fonts, settings, onProgress);

  if (candidates.length === 0) {
    throw new Error("No renderable glyph candidates are available");
  }

  progress(onProgress, "index", 1, 1, "Building density prefilter index");
  const index = new FeatureIndex(candidates);

  progress(onProgress, "cells", 0, columns * rows, "Sampling source image cells");
  const sourceCells = extractSourceCellFeatures(source, columns, rows);
  const mosaicCells: MosaicCell[] = [];
  const dither = createDitherBuffer(columns, rows);

  for (const sourceCell of sourceCells) {
    const currentError = settings.useDithering ? dither[sourceCell.y][sourceCell.x] : 0;
    const targetDensity = clamp01(sourceCell.features.density + currentError);
    const targetFeature = cloneFeatureWithDensity(sourceCell.features, targetDensity);
    const candidate = index.query(targetFeature, {
      densityWindow: settings.densityWindow,
      useEdgeMatching: settings.useEdgeMatching,
    });

    if (settings.useDithering) {
      spreadDensityError(
        dither,
        sourceCell.x,
        sourceCell.y,
        targetDensity - candidate.features.density,
      );
    }

    mosaicCells.push({
      glyph: candidate.glyph,
      fontFamily: candidate.fontFamily,
      fontLabel: candidate.fontLabel,
      weight: candidate.weight,
      foreground: colorForCell(settings, settings.colorStrategy, sourceCell, candidate),
      background: settings.background,
      sourceColor: sourceCell.sourceColor,
      density: candidate.features.density,
    });

    if (mosaicCells.length % 160 === 0) {
      progress(
        onProgress,
        "cells",
        mosaicCells.length,
        columns * rows,
        `Generated ${mosaicCells.length.toLocaleString()} of ${(columns * rows).toLocaleString()} cells`,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  progress(onProgress, "done", columns * rows, columns * rows, "Mosaic ready");

  return {
    columns,
    rows,
    cellWidth: settings.cellWidth,
    cellHeight: settings.cellHeight,
    fontSize: settings.fontSize,
    background: settings.background,
    transparentBackground: settings.transparentBackground,
    cells: mosaicCells,
    candidateCount: candidates.length,
    sourceName,
  };
}

export function resolveGrid(
  sourceWidth: number,
  sourceHeight: number,
  settings: RenderSettings,
): { columns: number; rows: number } {
  if (settings.gridMode === "source-pixels") {
    const step = Math.max(1, settings.sourcePixelsPerGlyph);
    const cellAspectCompensation = settings.cellWidth / settings.cellHeight;
    return {
      columns: clampInteger(Math.round(sourceWidth / step), 8, 220),
      rows: clampInteger(Math.round((sourceHeight / step) * cellAspectCompensation), 4, 220),
    };
  }

  return {
    columns: clampInteger(Math.round(settings.columns), 8, 220),
    rows: clampInteger(Math.round(settings.rows), 4, 220),
  };
}

export function recommendGridForImage(
  sourceWidth: number,
  sourceHeight: number,
  cellWidth = 12,
  cellHeight = 16,
): { columns: number; rows: number; sourcePixelsPerGlyph: number } {
  const area = Math.max(1, sourceWidth * sourceHeight);
  const sourcePixelsPerGlyph = clampInteger(Math.round(Math.sqrt(area / 8_500)), 4, 64);
  const cellAspectCompensation = cellWidth / cellHeight;
  const columns = clampInteger(Math.round(sourceWidth / sourcePixelsPerGlyph), 32, 180);
  const rows = clampInteger(
    Math.round((sourceHeight / sourcePixelsPerGlyph) * cellAspectCompensation),
    18,
    180,
  );
  return { columns, rows, sourcePixelsPerGlyph };
}

function createDitherBuffer(columns: number, rows: number): number[][] {
  return Array.from({ length: rows + 1 }, () => Array.from({ length: columns + 2 }, () => 0));
}

function spreadDensityError(buffer: number[][], x: number, y: number, error: number): void {
  const scaled = error * 0.85;
  addError(buffer, x + 1, y, scaled * (7 / 16));
  addError(buffer, x - 1, y + 1, scaled * (3 / 16));
  addError(buffer, x, y + 1, scaled * (5 / 16));
  addError(buffer, x + 1, y + 1, scaled * (1 / 16));
}

function addError(buffer: number[][], x: number, y: number, error: number): void {
  if (y >= 0 && y < buffer.length && x >= 0 && x < buffer[y].length) {
    buffer[y][x] += error;
  }
}

function progress(
  onProgress: ProgressCallback | undefined,
  phase: GenerateProgress["phase"],
  completed: number,
  total: number,
  message: string,
): void {
  onProgress?.({ phase, completed, total, message });
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
