export function segmentGraphemes(input: string): string[] {
  const trimmed = input.replace(/\r\n/g, "\n");

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    return Array.from(segmenter.segment(trimmed), (part) => part.segment).filter(
      (glyph) => glyph !== "\n" && glyph !== "\r" && glyph !== "\t",
    );
  }

  return segmentGraphemesFallback(trimmed).filter(
    (glyph) => glyph !== "\n" && glyph !== "\r" && glyph !== "\t",
  );
}

export function uniqueGraphemes(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const glyph of segmentGraphemes(input)) {
    if (!seen.has(glyph)) {
      seen.add(glyph);
      result.push(glyph);
    }
  }

  return result;
}

export function isAsciiGrapheme(glyph: string): boolean {
  return Array.from(glyph).every((codePoint) => codePoint.codePointAt(0)! <= 0x7f);
}

export function combineGlyphSources(sources: string[]): string[] {
  return uniqueGraphemes(sources.join(""));
}

function segmentGraphemesFallback(input: string): string[] {
  const codePoints = Array.from(input);
  const result: string[] = [];
  let cluster = "";
  let regionalIndicatorRun = 0;

  const flush = (): void => {
    if (cluster) {
      result.push(cluster);
      cluster = "";
    }
    regionalIndicatorRun = 0;
  };

  for (const codePoint of codePoints) {
    if (!cluster) {
      cluster = codePoint;
      regionalIndicatorRun = isRegionalIndicator(codePoint) ? 1 : 0;
      continue;
    }

    if (isExtendingCodePoint(codePoint) || cluster.endsWith("\u200d")) {
      cluster += codePoint;
      continue;
    }

    if (codePoint === "\u200d") {
      cluster += codePoint;
      continue;
    }

    if (isRegionalIndicator(codePoint)) {
      if (regionalIndicatorRun % 2 === 1) {
        cluster += codePoint;
        regionalIndicatorRun += 1;
        continue;
      }

      flush();
      cluster = codePoint;
      regionalIndicatorRun = 1;
      continue;
    }

    flush();
    cluster = codePoint;
    regionalIndicatorRun = isRegionalIndicator(codePoint) ? 1 : 0;
  }

  flush();
  return result;
}

function isExtendingCodePoint(codePoint: string): boolean {
  const value = codePoint.codePointAt(0)!;
  return (
    isCombiningMark(value) ||
    isVariationSelector(value) ||
    isEmojiModifier(value) ||
    isTagCharacter(value) ||
    value === 0x20e3
  );
}

function isCombiningMark(value: number): boolean {
  return (
    (value >= 0x0300 && value <= 0x036f) ||
    (value >= 0x1ab0 && value <= 0x1aff) ||
    (value >= 0x1dc0 && value <= 0x1dff) ||
    (value >= 0x20d0 && value <= 0x20ff) ||
    (value >= 0xfe20 && value <= 0xfe2f)
  );
}

function isVariationSelector(value: number): boolean {
  return (value >= 0xfe00 && value <= 0xfe0f) || (value >= 0xe0100 && value <= 0xe01ef);
}

function isEmojiModifier(value: number): boolean {
  return value >= 0x1f3fb && value <= 0x1f3ff;
}

function isTagCharacter(value: number): boolean {
  return value >= 0xe0020 && value <= 0xe007f;
}

function isRegionalIndicator(codePoint: string): boolean {
  const value = codePoint.codePointAt(0)!;
  return value >= 0x1f1e6 && value <= 0x1f1ff;
}
