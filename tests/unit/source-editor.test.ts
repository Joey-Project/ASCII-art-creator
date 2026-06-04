import { describe, expect, it } from "vitest";
import {
  compactSourceEditState,
  deferredRotationClipSize,
  defaultCropOperation,
  defaultCropOperationForStage,
  fitFreeRotationInputSize,
  fitSizeWithinEditorLimit,
  MAX_EDIT_CANVAS_PIXELS,
  MAX_EDIT_CANVAS_SIDE,
  normalizeCrop,
  resetOperations,
  rotatedBoundingSize,
  type SourceEditState,
} from "../../src/core/source-editor";

describe("source editor geometry", () => {
  it("drops full-frame crop and zero-degree rotate operations as no-ops", () => {
    const source = { width: 100, height: 80 } as HTMLCanvasElement;
    const compacted = compactSourceEditState(source, {
      operations: [
        { kind: "crop", x: 0, y: 0, width: 100, height: 80, expand: false },
        { kind: "rotateFree", degrees: 0 },
      ],
    });

    expect(compacted.operations).toEqual([]);
  });

  it("keeps full-frame crops that intentionally clear deferred free-rotation clipping", () => {
    const source = { width: 100, height: 80 } as HTMLCanvasElement;
    const rotatedBounds = rotatedBoundingSize(100, 80, 20);
    const compacted = compactSourceEditState(source, {
      operations: [
        { kind: "rotateFree", degrees: 20 },
        {
          kind: "crop",
          x: 0,
          y: 0,
          width: rotatedBounds.width,
          height: rotatedBounds.height,
          expand: false,
        },
      ],
    });

    expect(compacted.operations).toHaveLength(2);
    expect(compacted.operations[1]?.kind).toBe("crop");
  });

  it("keeps crop expand operations from reusing a deferred free-rotation crop", () => {
    const operations: SourceEditState["operations"] = [
      { kind: "rotateFree", degrees: 35 },
      { kind: "crop", x: -20, y: -12, width: 140, height: 90, expand: true },
    ];

    expect(deferredRotationClipSize(operations, 100, 60)).toBeNull();
  });

  it("defers free-rotation clipping to the final source frame", () => {
    const operations: SourceEditState["operations"] = [
      { kind: "crop", x: 10, y: 5, width: 80, height: 40, expand: false },
      { kind: "rotateFree", degrees: 30 },
      { kind: "flip", axis: "horizontal" },
    ];

    expect(deferredRotationClipSize(operations, 100, 60)).toEqual({ width: 80, height: 40 });
  });

  it("preserves the first deferred frame across multiple free rotations", () => {
    const operations: SourceEditState["operations"] = [
      { kind: "rotateFree", degrees: 20 },
      { kind: "flip", axis: "horizontal" },
      { kind: "rotateFree", degrees: -15 },
    ];

    expect(deferredRotationClipSize(operations, 100, 60)).toEqual({ width: 100, height: 60 });
  });

  it("swaps the deferred free-rotation clip when a later 90 degree rotation runs", () => {
    const operations: SourceEditState["operations"] = [
      { kind: "rotateFree", degrees: 20 },
      { kind: "rotate90", turns: 1 },
    ];

    expect(deferredRotationClipSize(operations, 120, 70)).toEqual({ width: 70, height: 120 });
  });

  it("uses the deferred output frame when crop mode opens after free rotation", () => {
    expect(
      defaultCropOperationForStage({
        canvas: { width: 130, height: 100 } as HTMLCanvasElement,
        deferredRotationClip: { width: 100, height: 60 },
      }),
    ).toEqual({
      kind: "crop",
      x: 15,
      y: 20,
      width: 100,
      height: 60,
      expand: false,
    });
  });

  it("marks deferred crop defaults as expanded when transparent padding is needed", () => {
    expect(
      defaultCropOperationForStage({
        canvas: { width: 100, height: 10 } as HTMLCanvasElement,
        deferredRotationClip: { width: 100, height: 80 },
      }),
    ).toMatchObject({
      x: 0,
      y: -35,
      width: 100,
      height: 80,
      expand: true,
    });
  });

  it("clamps non-expanded crops and preserves expanded transparent padding", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 80 };

    expect(
      normalizeCrop({ ...defaultCropOperation(120, 100), x: -10, y: -5, expand: false }, bounds),
    ).toMatchObject({ x: 0, y: 0, width: 100, height: 80 });

    expect(
      normalizeCrop({ ...defaultCropOperation(120, 100), x: -10, y: -5, expand: true }, bounds),
    ).toMatchObject({ x: -10, y: -5, width: 120, height: 100 });
  });

  it("preserves non-expanded crop size when a moved crop hits the image edge", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 80 };

    expect(
      normalizeCrop({ kind: "crop", x: -10, y: 8, width: 50, height: 30, expand: false }, bounds),
    ).toMatchObject({ x: 0, y: 8, width: 50, height: 30 });
  });

  it("caps expanded crop and editor canvas sizes to the editing budget", () => {
    const fitted = fitSizeWithinEditorLimit(20_000, 12_000);
    expect(fitted.width).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(fitted.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_PIXELS);

    const crop = normalizeCrop(
      { kind: "crop", x: -8_000, y: -4_000, width: 20_000, height: 12_000, expand: true },
      { x: 0, y: 0, width: 100, height: 80 },
    );
    expect(crop.width).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(crop.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(crop.width * crop.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_PIXELS);
  });

  it("downscales the free-rotation input when the expanded bounds would exceed budget", () => {
    const fitted = fitFreeRotationInputSize(8_192, 1_953, 45);
    const bounds = rotatedBoundingSize(fitted.width, fitted.height, 45);

    expect(bounds.width).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(bounds.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_SIDE);
    expect(bounds.width * bounds.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_PIXELS);

    const narrowFitted = fitFreeRotationInputSize(10_000, 1, 45);
    const narrowBounds = rotatedBoundingSize(narrowFitted.width, narrowFitted.height, 45);
    expect(narrowBounds.width * narrowBounds.height).toBeLessThanOrEqual(MAX_EDIT_CANVAS_PIXELS);
  });

  it("removes operations by feature group", () => {
    const state: SourceEditState = {
      operations: [
        { kind: "crop", x: 0, y: 0, width: 20, height: 20, expand: false },
        { kind: "rotate90", turns: 1 },
        { kind: "rotateFree", degrees: 12 },
        { kind: "flip", axis: "vertical" },
      ],
    };

    expect(resetOperations(state, "rotate").operations).toEqual([
      { kind: "crop", x: 0, y: 0, width: 20, height: 20, expand: false },
      { kind: "flip", axis: "vertical" },
    ]);
    expect(resetOperations(state, "all").operations).toHaveLength(0);
  });

  it("drops downstream crops whose coordinate space depended on reset transforms", () => {
    expect(
      resetOperations(
        {
          operations: [
            { kind: "rotate90", turns: 1 },
            { kind: "crop", x: 4, y: 6, width: 40, height: 30, expand: false },
            { kind: "flip", axis: "horizontal" },
          ],
        },
        "rotate",
      ).operations,
    ).toEqual([{ kind: "flip", axis: "horizontal" }]);

    expect(
      resetOperations(
        {
          operations: [
            { kind: "flip", axis: "vertical" },
            { kind: "crop", x: 4, y: 6, width: 40, height: 30, expand: false },
          ],
        },
        "flip",
      ).operations,
    ).toEqual([]);
  });

  it("does not drop downstream crops when reset removes only a zero-degree free rotate", () => {
    expect(
      resetOperations(
        {
          operations: [
            { kind: "rotateFree", degrees: 0 },
            { kind: "crop", x: 4, y: 6, width: 40, height: 30, expand: false },
          ],
        },
        "rotate",
      ).operations,
    ).toEqual([{ kind: "crop", x: 4, y: 6, width: 40, height: 30, expand: false }]);
  });

  it("calculates expanded bounds for arbitrary free rotation", () => {
    expect(rotatedBoundingSize(100, 50, 90)).toEqual({ width: 50, height: 100 });
    expect(rotatedBoundingSize(100, 50, 45)).toEqual({ width: 107, height: 107 });
  });
});
