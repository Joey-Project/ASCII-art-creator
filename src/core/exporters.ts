import { jsPDF } from "jspdf";
import type { ExportFormat, Mosaic } from "../domain/types";
import { cssFontFamily, renderMosaicToCanvas } from "./canvas";

export interface ExportOptions {
  format: ExportFormat;
  scale: number;
}

export interface ExportSize {
  width: number;
  height: number;
  pixels: number;
}

export const MAX_EXPORT_DIMENSION = 12_000;
export const MAX_EXPORT_PIXELS = 48_000_000;

export async function exportMosaic(mosaic: Mosaic, options: ExportOptions): Promise<void> {
  switch (options.format) {
    case "txt":
      downloadText(`${baseName(mosaic.sourceName)}.txt`, mosaicToText(mosaic), "text/plain");
      return;
    case "svg":
      downloadText(`${baseName(mosaic.sourceName)}.svg`, mosaicToSvg(mosaic), "image/svg+xml");
      return;
    case "png":
      await downloadCanvas(
        mosaic,
        options.scale,
        "image/png",
        `${baseName(mosaic.sourceName)}.png`,
      );
      return;
    case "jpeg":
      await downloadCanvas(
        mosaic,
        options.scale,
        "image/jpeg",
        `${baseName(mosaic.sourceName)}.jpg`,
      );
      return;
    case "pdf":
      await downloadPdf(mosaic, options.scale);
      return;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

export function mosaicToText(mosaic: Mosaic): string {
  const lines: string[] = [];
  for (let y = 0; y < mosaic.rows; y += 1) {
    const row = mosaic.cells.slice(y * mosaic.columns, (y + 1) * mosaic.columns);
    lines.push(row.map((cell) => cell.glyph).join(""));
  }
  return `${lines.join("\n")}\n`;
}

export function mosaicToSvg(mosaic: Mosaic): string {
  const width = mosaic.columns * mosaic.cellWidth;
  const height = mosaic.rows * mosaic.cellHeight;
  const background = mosaic.transparentBackground
    ? ""
    : `<rect width="100%" height="100%" fill="${escapeXml(mosaic.background)}" />`;
  const fontFaces = svgFontFaceDefinitions(mosaic);
  const text = mosaic.cells
    .map((cell, index) => {
      const x = index % mosaic.columns;
      const y = Math.floor(index / mosaic.columns);
      const tx = x * mosaic.cellWidth + mosaic.cellWidth / 2;
      const ty = y * mosaic.cellHeight + mosaic.cellHeight / 2 + mosaic.cellHeight * 0.22;
      return `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" text-anchor="middle" font-family="${escapeXml(
        cssFontFamily(cell.fontFamily),
      )}" font-size="${mosaic.fontSize}" font-weight="${cell.weight}" fill="${escapeXml(
        cell.foreground,
      )}">${escapeXml(cell.glyph)}</text>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    fontFaces,
    background,
    text,
    "</svg>",
  ].join("");
}

export function mosaicForCanvasExport(mosaic: Mosaic, type: "image/png" | "image/jpeg"): Mosaic {
  if (type !== "image/jpeg" || !mosaic.transparentBackground) {
    return mosaic;
  }

  return {
    ...mosaic,
    transparentBackground: false,
    background: "#ffffff",
    cells: mosaic.cells.map((cell) => ({ ...cell, background: "#ffffff" })),
  };
}

export function validateExportSize(mosaic: Mosaic, scale: number): ExportSize {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Export scale must be a positive number");
  }

  const width = Math.max(1, Math.round(mosaic.columns * mosaic.cellWidth * scale));
  const height = Math.max(1, Math.round(mosaic.rows * mosaic.cellHeight * scale));
  const pixels = width * height;

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(pixels) ||
    width > MAX_EXPORT_DIMENSION ||
    height > MAX_EXPORT_DIMENSION ||
    pixels > MAX_EXPORT_PIXELS
  ) {
    throw new Error(
      `Export is too large (${width.toLocaleString()} x ${height.toLocaleString()}). Reduce rows, columns, cell size, or output scale.`,
    );
  }

  return { width, height, pixels };
}

async function downloadCanvas(
  mosaic: Mosaic,
  scale: number,
  type: "image/png" | "image/jpeg",
  fileName: string,
): Promise<void> {
  validateExportSize(mosaic, scale);
  const exportMosaic = mosaicForCanvasExport(mosaic, type);
  const canvas = renderMosaicToCanvas(exportMosaic, scale);
  const blob = await canvasToBlob(canvas, type, type === "image/jpeg" ? 0.92 : undefined);
  downloadBlob(fileName, blob);
}

async function downloadPdf(mosaic: Mosaic, scale: number): Promise<void> {
  validateExportSize(mosaic, scale);
  const canvas = renderMosaicToCanvas(mosaic, scale);
  const imageData = canvas.toDataURL("image/png");
  const width = canvas.width;
  const height = canvas.height;
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    compress: true,
  });
  pdf.addImage(imageData, "PNG", 0, 0, width, height);
  pdf.save(`${baseName(mosaic.sourceName)}.pdf`);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas export failed"));
        }
      },
      type,
      quality,
    );
  });
}

function downloadText(fileName: string, content: string, mimeType: string): void {
  downloadBlob(fileName, new Blob([content], { type: `${mimeType};charset=utf-8` }));
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "glyph-mosaic";
}

function svgFontFaceDefinitions(mosaic: Mosaic): string {
  const fontFaces = new Map<string, string>();
  for (const cell of mosaic.cells) {
    if (cell.fontDataUrl && !fontFaces.has(cell.fontFamily)) {
      fontFaces.set(cell.fontFamily, cell.fontDataUrl);
    }
  }

  if (fontFaces.size === 0) {
    return "";
  }

  const css = Array.from(fontFaces.entries())
    .map(
      ([family, dataUrl]) =>
        `@font-face{font-family:${cssFontFamily(family)};src:url("${escapeCssString(dataUrl)}");}`,
    )
    .join("");
  return `<defs><style><![CDATA[${css}]]></style></defs>`;
}

function escapeCssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("]]>", "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
