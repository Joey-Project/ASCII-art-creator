export type ColorMode = "mono" | "color";

export type ColorStrategy = "source" | "uniform" | "glyph" | "font" | "glyph-font";

export type ExportFormat = "png" | "jpeg" | "svg" | "txt" | "pdf";

export type FontSource = "builtin" | "uploaded" | "local";

export type GridMode = "dimensions" | "source-pixels";

export interface RenderSettings {
  gridMode: GridMode;
  columns: number;
  rows: number;
  sourcePixelsPerGlyph: number;
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  outputScale: number;
  colorMode: ColorMode;
  colorStrategy: ColorStrategy;
  foreground: string;
  background: string;
  transparentBackground: boolean;
  useDithering: boolean;
  useEdgeMatching: boolean;
  densityWindow: number;
}

export interface FontChoice {
  id: string;
  family: string;
  label: string;
  source: FontSource;
  selected: boolean;
  weights: number[];
  dataUrl?: string;
}

export interface GlyphPack {
  id: string;
  label: string;
  description: string;
  glyphs: string;
  defaultEnabled: boolean;
  asciiOnly: boolean;
}

export interface EdgeFeature {
  vertical: number;
  horizontal: number;
  diagonalForward: number;
  diagonalBack: number;
}

export interface GlyphFeature {
  density: number;
  contrast: number;
  centerX: number;
  centerY: number;
  quadrants: [number, number, number, number];
  edges: EdgeFeature;
}

export interface GlyphCandidate {
  id: string;
  glyph: string;
  fontFamily: string;
  fontLabel: string;
  fontSource: FontSource;
  fontDataUrl?: string;
  weight: number;
  features: GlyphFeature;
  intrinsicColor?: string;
  intrinsicColorStrength?: number;
}

export interface SourceCellFeature {
  x: number;
  y: number;
  features: GlyphFeature;
  sourceColor: string;
}

export interface MosaicCell {
  glyph: string;
  fontFamily: string;
  fontLabel: string;
  fontSource: FontSource;
  fontDataUrl?: string;
  weight: number;
  intrinsicColor?: string;
  intrinsicColorStrength?: number;
  foreground: string;
  background: string;
  sourceColor: string;
  density: number;
}

export interface Mosaic {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  background: string;
  transparentBackground: boolean;
  cells: MosaicCell[];
  candidateCount: number;
  sourceName: string;
}

export interface GenerateProgress {
  phase: "fonts" | "glyphs" | "index" | "cells" | "done";
  completed: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: GenerateProgress) => void;
