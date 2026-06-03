import type { Mosaic, MosaicCell, RenderSettings } from "../domain/types";

export function cssFontFamily(family: string): string {
  const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
  return generic.has(family) ? family : JSON.stringify(family);
}

export function canvasFont(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${cssFontFamily(family)}`;
}

export function renderMosaicToCanvas(mosaic: Mosaic, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  drawMosaicToCanvas(canvas, mosaic, scale);
  return canvas;
}

export function drawMosaicToCanvas(
  canvas: HTMLCanvasElement,
  mosaic: Mosaic,
  scale = 1,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(mosaic.columns * mosaic.cellWidth * scale));
  const height = Math.max(1, Math.round(mosaic.rows * mosaic.cellHeight * scale));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("Canvas 2D rendering is not available");
  }

  context.clearRect(0, 0, width, height);
  if (!mosaic.transparentBackground) {
    context.fillStyle = mosaic.background;
    context.fillRect(0, 0, width, height);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.imageSmoothingEnabled = true;

  for (let y = 0; y < mosaic.rows; y += 1) {
    for (let x = 0; x < mosaic.columns; x += 1) {
      const cell = mosaic.cells[y * mosaic.columns + x];
      drawCell(context, cell, x, y, mosaic, scale);
    }
  }

  return canvas;
}

function drawCell(
  context: CanvasRenderingContext2D,
  cell: MosaicCell,
  x: number,
  y: number,
  mosaic: Mosaic,
  scale: number,
): void {
  const cellWidth = mosaic.cellWidth * scale;
  const cellHeight = mosaic.cellHeight * scale;
  const left = x * cellWidth;
  const top = y * cellHeight;

  if (!mosaic.transparentBackground && cell.background !== mosaic.background) {
    context.fillStyle = cell.background;
    context.fillRect(left, top, cellWidth, cellHeight);
  }

  context.fillStyle = cell.foreground;
  context.font = canvasFont(cell.weight, mosaic.fontSize * scale, cell.fontFamily);
  context.fillText(cell.glyph, left + cellWidth / 2, top + cellHeight / 2 + cellHeight * 0.035);
}

export function applySettingsToPreviewCanvas(
  canvas: HTMLCanvasElement,
  mosaic: Mosaic | null,
  settings: RenderSettings,
): void {
  if (!mosaic) {
    canvas.width = 900;
    canvas.height = 540;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = settings.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#5f6669";
    context.font = "600 22px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Upload an image or load the sample to generate a mosaic", 450, 270);
    return;
  }

  drawMosaicToCanvas(canvas, mosaic, 1);
}
