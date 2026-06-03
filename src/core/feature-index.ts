import type { GlyphCandidate, GlyphFeature } from "../domain/types";
import { featureDistance } from "./features";

export interface FeatureIndexOptions {
  densityWindow: number;
  useEdgeMatching: boolean;
}

export class FeatureIndex {
  private readonly buckets = new Map<number, GlyphCandidate[]>();

  constructor(private readonly candidates: GlyphCandidate[]) {
    for (const candidate of candidates) {
      const bucket = FeatureIndex.bucketFor(candidate.features.density);
      const existing = this.buckets.get(bucket) ?? [];
      existing.push(candidate);
      this.buckets.set(bucket, existing);
    }
  }

  query(target: GlyphFeature, options: FeatureIndexOptions): GlyphCandidate {
    if (this.candidates.length === 0) {
      throw new Error("Cannot query an empty glyph index");
    }

    const densityWindow = Math.max(1, Math.round(options.densityWindow));
    const center = FeatureIndex.bucketFor(target.density);
    let pool = this.collectCandidates(center, densityWindow);

    if (pool.length < 8) {
      pool = this.collectCandidates(center, Math.max(15, densityWindow * 2));
    }

    if (pool.length === 0) {
      pool = this.candidates;
    }

    let best = pool[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of pool) {
      const score = featureDistance(target, candidate.features, options.useEdgeMatching);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  private collectCandidates(center: number, window: number): GlyphCandidate[] {
    const result: GlyphCandidate[] = [];
    const start = Math.max(0, center - window);
    const end = Math.min(100, center + window);

    for (let bucket = start; bucket <= end; bucket += 1) {
      const candidates = this.buckets.get(bucket);
      if (candidates) {
        result.push(...candidates);
      }
    }

    return result;
  }

  private static bucketFor(density: number): number {
    return Math.round(Math.max(0, Math.min(1, density)) * 100);
  }
}
