import type { GlyphFeature, SourceCellFeature } from "../domain/types";
import { FEATURE_SIZE, clamp01, extractFeatureFromDarkness } from "./features";
import { rgbToHex } from "./colors";

export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImageFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be decoded"));
    image.src = url;
  });
}

export function createSampleImage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 620;
  const context = canvas.getContext("2d")!;

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#f5f3e8");
  gradient.addColorStop(0.38, "#59a69a");
  gradient.addColorStop(0.68, "#d08745");
  gradient.addColorStop(1, "#282b2d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.beginPath();
  context.arc(280, 280, 150, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(25, 31, 34, 0.82)";
  context.beginPath();
  context.moveTo(600, 110);
  context.lineTo(830, 520);
  context.lineTo(430, 520);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 34;
  context.beginPath();
  context.moveTo(90, 520);
  context.bezierCurveTo(260, 80, 650, 680, 890, 130);
  context.stroke();

  return canvas;
}

export function extractSourceCellFeatures(
  source: ImageSource,
  columns: number,
  rows: number,
): SourceCellFeature[] {
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = columns * FEATURE_SIZE;
  analysisCanvas.height = rows * FEATURE_SIZE;
  const context = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D analysis is not available");
  }

  context.drawImage(source, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const imageData = context.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const cells: SourceCellFeature[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const { feature, color } = extractSingleCell(imageData, x, y, columns);
      cells.push({ x, y, features: feature, sourceColor: color });
    }
  }

  return cells;
}

function extractSingleCell(
  imageData: ImageData,
  cellX: number,
  cellY: number,
  columns: number,
): { feature: GlyphFeature; color: string } {
  const values = new Float32Array(FEATURE_SIZE * FEATURE_SIZE);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let y = 0; y < FEATURE_SIZE; y += 1) {
    for (let x = 0; x < FEATURE_SIZE; x += 1) {
      const absoluteX = cellX * FEATURE_SIZE + x;
      const absoluteY = cellY * FEATURE_SIZE + y;
      const offset = (absoluteY * columns * FEATURE_SIZE + absoluteX) * 4;
      const alpha = imageData.data[offset + 3] / 255;
      const sampleRed = imageData.data[offset];
      const sampleGreen = imageData.data[offset + 1];
      const sampleBlue = imageData.data[offset + 2];
      const composited = compositeOnWhite(sampleRed, sampleGreen, sampleBlue, alpha);
      const luminance =
        (0.2126 * composited.red + 0.7152 * composited.green + 0.0722 * composited.blue) / 255;
      values[y * FEATURE_SIZE + x] = clamp01(1 - luminance);
      red += composited.red;
      green += composited.green;
      blue += composited.blue;
      count += 1;
    }
  }

  return {
    feature: extractFeatureFromDarkness(values),
    color: rgbToHex(red / count, green / count, blue / count),
  };
}

export function compositeOnWhite(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): { red: number; green: number; blue: number } {
  const clampedAlpha = clamp01(alpha);
  return {
    red: red * clampedAlpha + 255 * (1 - clampedAlpha),
    green: green * clampedAlpha + 255 * (1 - clampedAlpha),
    blue: blue * clampedAlpha + 255 * (1 - clampedAlpha),
  };
}
