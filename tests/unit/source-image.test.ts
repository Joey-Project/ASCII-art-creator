import { describe, expect, it } from "vitest";
import { compositeOnWhite } from "../../src/core/source-image";

describe("source image sampling", () => {
  it("treats transparent pixels as white background during analysis", () => {
    const composited = compositeOnWhite(0, 0, 0, 0);

    expect(composited.red).toBeCloseTo(255);
    expect(composited.green).toBeCloseTo(255);
    expect(composited.blue).toBeCloseTo(255);
  });

  it("alpha-composites partial transparency before color and density analysis", () => {
    const composited = compositeOnWhite(0, 0, 0, 0.5);

    expect(composited.red).toBeCloseTo(187.52, 2);
    expect(composited.green).toBeCloseTo(187.52, 2);
    expect(composited.blue).toBeCloseTo(187.52, 2);
  });
});
