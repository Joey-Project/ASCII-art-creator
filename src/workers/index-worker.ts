import type { GlyphCandidate, GlyphFeature } from "../domain/types";
import { FeatureIndex } from "../core/feature-index";

interface BuildMessage {
  type: "build";
  candidates: GlyphCandidate[];
}

interface QueryMessage {
  type: "query";
  target: GlyphFeature;
  densityWindow: number;
  useEdgeMatching: boolean;
}

let index: FeatureIndex | null = null;

self.addEventListener("message", (event: MessageEvent<BuildMessage | QueryMessage>) => {
  if (event.data.type === "build") {
    index = new FeatureIndex(event.data.candidates);
    self.postMessage({ type: "built", count: event.data.candidates.length });
    return;
  }

  if (!index) {
    self.postMessage({ type: "error", message: "Index is not built" });
    return;
  }

  const candidate = index.query(event.data.target, {
    densityWindow: event.data.densityWindow,
    useEdgeMatching: event.data.useEdgeMatching,
  });
  self.postMessage({ type: "result", candidate });
});
