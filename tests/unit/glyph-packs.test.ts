import { describe, expect, it } from "vitest";
import { GLYPH_PACKS } from "../../src/domain/glyph-packs";

describe("glyph packs", () => {
  it("defaults to ASCII only", () => {
    expect(GLYPH_PACKS.filter((pack) => pack.defaultEnabled).map((pack) => pack.id)).toEqual([
      "ascii",
    ]);
  });

  it("labels math glyphs as symbols", () => {
    expect(GLYPH_PACKS.find((pack) => pack.id === "math")).toMatchObject({
      label: "Math Symbols",
    });
  });
});
