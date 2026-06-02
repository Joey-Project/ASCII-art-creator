export function segmentGraphemes(input: string): string[] {
  const trimmed = input.replace(/\r\n/g, "\n");

  if ("Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    return Array.from(segmenter.segment(trimmed), (part) => part.segment).filter(
      (glyph) => glyph !== "\n" && glyph !== "\r" && glyph !== "\t",
    );
  }

  return Array.from(trimmed).filter((glyph) => glyph !== "\n" && glyph !== "\r" && glyph !== "\t");
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
