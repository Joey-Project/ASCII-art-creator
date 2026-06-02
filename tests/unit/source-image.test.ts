import { describe, expect, it } from "vitest";
import { compositeOnWhite } from "../../src/core/source-image";

describe("source image sampling", () => {
  it("treats transparent pixels as white background during analysis", () => {
    expect(compositeOnWhite(0, 0, 0, 0)).toEqual({ red: 255, green: 255, blue: 255 });
  });

  it("alpha-composites partial transparency before color and density analysis", () => {
    expect(compositeOnWhite(0, 0, 0, 0.5)).toEqual({
      red: 127.5,
      green: 127.5,
      blue: 127.5,
    });
  });
});
