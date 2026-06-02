import type { EdgeFeature, GlyphFeature } from "../domain/types";

export const FEATURE_SIZE = 18;

export function emptyFeature(): GlyphFeature {
  return {
    density: 0,
    contrast: 0,
    centerX: 0.5,
    centerY: 0.5,
    quadrants: [0, 0, 0, 0],
    edges: {
      vertical: 0,
      horizontal: 0,
      diagonalForward: 0,
      diagonalBack: 0,
    },
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function extractFeatureFromDarkness(
  values: Float32Array,
  size = FEATURE_SIZE,
): GlyphFeature {
  if (values.length !== size * size) {
    throw new Error(`Expected ${size * size} feature values, received ${values.length}`);
  }

  let sum = 0;
  let sumSquares = 0;
  let weightedX = 0;
  let weightedY = 0;
  const quadrants: [number, number, number, number] = [0, 0, 0, 0];
  const quadrantCounts: [number, number, number, number] = [0, 0, 0, 0];
  const half = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = clamp01(values[y * size + x]);
      sum += value;
      sumSquares += value * value;
      weightedX += value * x;
      weightedY += value * y;

      const quadrant = (y >= half ? 2 : 0) + (x >= half ? 1 : 0);
      quadrants[quadrant] += value;
      quadrantCounts[quadrant] += 1;
    }
  }

  const pixelCount = size * size;
  const density = sum / pixelCount;
  const variance = Math.max(0, sumSquares / pixelCount - density * density);
  const contrast = Math.sqrt(variance);
  const centerX = sum > 0 ? weightedX / sum / (size - 1) : 0.5;
  const centerY = sum > 0 ? weightedY / sum / (size - 1) : 0.5;

  for (let index = 0; index < quadrants.length; index += 1) {
    quadrants[index] = quadrants[index] / quadrantCounts[index];
  }

  return {
    density,
    contrast,
    centerX,
    centerY,
    quadrants,
    edges: extractEdges(values, size),
  };
}

function extractEdges(values: Float32Array, size: number): EdgeFeature {
  let vertical = 0;
  let horizontal = 0;
  let diagonalForward = 0;
  let diagonalBack = 0;
  let count = 0;

  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const left = values[y * size + x - 1];
      const right = values[y * size + x + 1];
      const top = values[(y - 1) * size + x];
      const bottom = values[(y + 1) * size + x];
      const topLeft = values[(y - 1) * size + x - 1];
      const topRight = values[(y - 1) * size + x + 1];
      const bottomLeft = values[(y + 1) * size + x - 1];
      const bottomRight = values[(y + 1) * size + x + 1];

      vertical += Math.abs(right - left);
      horizontal += Math.abs(bottom - top);
      diagonalForward += Math.abs(topRight - bottomLeft);
      diagonalBack += Math.abs(topLeft - bottomRight);
      count += 1;
    }
  }

  if (count === 0) {
    return { vertical: 0, horizontal: 0, diagonalForward: 0, diagonalBack: 0 };
  }

  return {
    vertical: vertical / count,
    horizontal: horizontal / count,
    diagonalForward: diagonalForward / count,
    diagonalBack: diagonalBack / count,
  };
}

export function featureDistance(
  target: GlyphFeature,
  candidate: GlyphFeature,
  useEdgeMatching: boolean,
): number {
  let score = 0;
  score += Math.abs(target.density - candidate.density) * 4.5;
  score += Math.abs(target.contrast - candidate.contrast) * 1.15;
  score += Math.abs(target.centerX - candidate.centerX) * 0.3;
  score += Math.abs(target.centerY - candidate.centerY) * 0.3;

  for (let index = 0; index < target.quadrants.length; index += 1) {
    score += Math.abs(target.quadrants[index] - candidate.quadrants[index]) * 0.65;
  }

  if (useEdgeMatching) {
    score += Math.abs(target.edges.vertical - candidate.edges.vertical) * 0.9;
    score += Math.abs(target.edges.horizontal - candidate.edges.horizontal) * 0.9;
    score += Math.abs(target.edges.diagonalForward - candidate.edges.diagonalForward) * 0.7;
    score += Math.abs(target.edges.diagonalBack - candidate.edges.diagonalBack) * 0.7;
  }

  return score;
}

export function cloneFeatureWithDensity(feature: GlyphFeature, density: number): GlyphFeature {
  return {
    ...feature,
    density: clamp01(density),
    quadrants: [...feature.quadrants],
    edges: { ...feature.edges },
  };
}
