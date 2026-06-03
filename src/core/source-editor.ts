import type { ImageSource } from "./source-image";

export type SourceEditorMode = "idle" | "crop" | "rotate";

export type SourceEditOperation =
  | CropEditOperation
  | Rotate90EditOperation
  | RotateFreeEditOperation
  | FlipEditOperation;

export interface CropEditOperation {
  kind: "crop";
  x: number;
  y: number;
  width: number;
  height: number;
  expand: boolean;
}

export interface Rotate90EditOperation {
  kind: "rotate90";
  turns: 1 | -1;
}

export interface RotateFreeEditOperation {
  kind: "rotateFree";
  degrees: number;
}

export interface FlipEditOperation {
  kind: "flip";
  axis: "horizontal" | "vertical";
}

export interface SourceEditState {
  operations: SourceEditOperation[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface EditorRenderMetrics {
  scale: number;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
}

export interface RenderSourceEditOptions {
  clipDeferredRotation?: boolean;
  stopBeforeOperation?: number;
}

export interface SourceEditRenderStage {
  operationIndex: number;
  canvas: HTMLCanvasElement;
  deferredRotationClip: SourceEditDeferredClip | null;
}

interface SourceEditDeferredClip {
  width: number;
  height: number;
}

interface FreeRotateResult {
  canvas: HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  scaleX: number;
  scaleY: number;
}

export const MIN_CROP_SIZE = 8;
export const MAX_EDIT_CANVAS_PIXELS = 16_000_000;
export const MAX_EDIT_CANVAS_SIDE = 8_192;

export function createDefaultSourceEditState(): SourceEditState {
  return { operations: [] };
}

export function cloneSourceEditState(state: SourceEditState): SourceEditState {
  return {
    operations: state.operations.map((operation) => ({ ...operation })),
  };
}

export function compactSourceEditState(
  source: ImageSource,
  state: SourceEditState,
): SourceEditState {
  let dimensions = fitSizeWithinEditorLimit(source.width, source.height);
  let hasDeferredRotationClip = false;
  const operations: SourceEditOperation[] = [];

  for (const operation of state.operations) {
    switch (operation.kind) {
      case "crop": {
        const crop = normalizeCrop(operation, {
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height,
        });
        if (!isFullFrameCrop(crop, dimensions) || hasDeferredRotationClip) {
          operations.push(crop);
        }
        hasDeferredRotationClip = false;
        dimensions = {
          width: Math.max(1, Math.round(crop.width)),
          height: Math.max(1, Math.round(crop.height)),
        };
        break;
      }
      case "rotate90":
        operations.push(operation);
        dimensions = { width: dimensions.height, height: dimensions.width };
        break;
      case "rotateFree":
        if (Math.abs(operation.degrees) >= 0.0001) {
          const fitted = fitFreeRotationInputSize(
            dimensions.width,
            dimensions.height,
            operation.degrees,
          );
          dimensions = rotatedBoundingSize(fitted.width, fitted.height, operation.degrees);
          hasDeferredRotationClip = true;
          operations.push(operation);
        }
        break;
      case "flip":
        operations.push(operation);
        break;
      default:
        exhaustive(operation);
    }
  }

  return { operations };
}

export function resetOperations(
  state: SourceEditState,
  group: "all" | "crop" | "rotate" | "flip",
): SourceEditState {
  if (group === "all") {
    return createDefaultSourceEditState();
  }

  let removedSpatialTransform = false;
  return {
    operations: state.operations.filter((operation) => {
      if (group === "crop") {
        return operation.kind !== "crop";
      }
      if (group === "rotate") {
        if (operation.kind === "rotate90" || operation.kind === "rotateFree") {
          if (operation.kind === "rotate90" || Math.abs(operation.degrees) >= 0.0001) {
            removedSpatialTransform = true;
          }
          return false;
        }
        if (operation.kind === "crop" && removedSpatialTransform) {
          return false;
        }
        return true;
      }
      if (operation.kind === "flip") {
        removedSpatialTransform = true;
        return false;
      }
      if (operation.kind === "crop" && removedSpatialTransform) {
        return false;
      }
      return true;
    }),
  };
}

export function sourceDimensions(source: ImageSource): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(source.width)),
    height: Math.max(1, Math.round(source.height)),
  };
}

export function normalizeCrop(crop: CropEditOperation, bounds: Rect): CropEditOperation {
  let x = crop.x;
  let y = crop.y;
  let width = Math.max(MIN_CROP_SIZE, crop.width);
  let height = Math.max(MIN_CROP_SIZE, crop.height);

  if (!crop.expand) {
    width = Math.min(width, bounds.width);
    height = Math.min(height, bounds.height);
    x = clamp(x, bounds.x, bounds.x + bounds.width - width);
    y = clamp(y, bounds.y, bounds.y + bounds.height - height);
  } else {
    const fitted = fitSizeWithinEditorLimit(width, height);
    if (fitted.width !== width || fitted.height !== height) {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      width = fitted.width;
      height = fitted.height;
      x = centerX - width / 2;
      y = centerY - height / 2;
    }
  }

  return { ...crop, x, y, width, height };
}

export function defaultCropOperation(
  width: number,
  height: number,
  expand = false,
): CropEditOperation {
  return {
    kind: "crop",
    x: 0,
    y: 0,
    width,
    height,
    expand,
  };
}

export function defaultCropOperationForStage(
  stage: Pick<SourceEditRenderStage, "canvas" | "deferredRotationClip">,
): CropEditOperation {
  const deferred = stage.deferredRotationClip;
  if (!deferred) {
    return defaultCropOperation(stage.canvas.width, stage.canvas.height);
  }

  const crop = {
    kind: "crop" as const,
    x: (stage.canvas.width - deferred.width) / 2,
    y: (stage.canvas.height - deferred.height) / 2,
    width: deferred.width,
    height: deferred.height,
    expand: false,
  };
  return {
    ...crop,
    expand: cropExtendsBeyondCanvas(crop, stage.canvas),
  };
}

export function rotatedBoundingSize(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const radians = degreesToRadians(degrees);
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  return {
    width: Math.max(1, Math.ceil(cleanFloat(width * cos + height * sin))),
    height: Math.max(1, Math.ceil(cleanFloat(width * sin + height * cos))),
  };
}

export function fitSizeWithinEditorLimit(
  width: number,
  height: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    1,
    MAX_EDIT_CANVAS_SIDE / safeWidth,
    MAX_EDIT_CANVAS_SIDE / safeHeight,
    Math.sqrt(MAX_EDIT_CANVAS_PIXELS / (safeWidth * safeHeight)),
  );
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
  };
}

export function fitFreeRotationInputSize(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (isWithinEditorLimit(rotatedBoundingSize(safeWidth, safeHeight, degrees))) {
    return { width: safeWidth, height: safeHeight };
  }

  let low = 0;
  let high = 1;
  for (let index = 0; index < 32; index += 1) {
    const mid = (low + high) / 2;
    const candidate = scaledSize(safeWidth, safeHeight, mid);
    if (isWithinEditorLimit(rotatedBoundingSize(candidate.width, candidate.height, degrees))) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return scaledSize(safeWidth, safeHeight, low);
}

function scaledSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function isWithinEditorLimit(size: { width: number; height: number }): boolean {
  return (
    size.width <= MAX_EDIT_CANVAS_SIDE &&
    size.height <= MAX_EDIT_CANVAS_SIDE &&
    size.width * size.height <= MAX_EDIT_CANVAS_PIXELS
  );
}

function scaleDeferredClip(
  deferred: SourceEditDeferredClip,
  scaleX: number,
  scaleY: number,
): SourceEditDeferredClip {
  return {
    width: Math.max(1, Math.round(deferred.width * scaleX)),
    height: Math.max(1, Math.round(deferred.height * scaleY)),
  };
}

function cropExtendsBeyondCanvas(crop: CropEditOperation, canvas: HTMLCanvasElement): boolean {
  return (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > canvas.width ||
    crop.y + crop.height > canvas.height
  );
}

export function deferredRotationClipSize(
  operations: SourceEditOperation[],
  initialWidth: number,
  initialHeight: number,
): { width: number; height: number } | null {
  let width = initialWidth;
  let height = initialHeight;
  let deferred: SourceEditDeferredClip | null = null;

  for (const operation of operations) {
    switch (operation.kind) {
      case "crop": {
        width = Math.max(1, Math.round(operation.width));
        height = Math.max(1, Math.round(operation.height));
        deferred = null;
        break;
      }
      case "rotate90": {
        if (Math.abs(operation.turns) % 2 === 1) {
          [width, height] = [height, width];
          if (deferred) {
            [deferred.width, deferred.height] = [deferred.height, deferred.width];
          }
        }
        break;
      }
      case "rotateFree": {
        if (Math.abs(operation.degrees) >= 0.0001) {
          const fitted = fitFreeRotationInputSize(width, height, operation.degrees);
          if (deferred) {
            deferred = scaleDeferredClip(deferred, fitted.width / width, fitted.height / height);
          } else {
            deferred = { width: fitted.width, height: fitted.height };
          }
          const bounds = rotatedBoundingSize(fitted.width, fitted.height, operation.degrees);
          width = bounds.width;
          height = bounds.height;
        }
        break;
      }
      case "flip":
        break;
      default:
        exhaustive(operation);
    }
  }

  return deferred;
}

export function renderEditedSource(
  source: ImageSource,
  state: SourceEditState,
  options: RenderSourceEditOptions = {},
): HTMLCanvasElement {
  const operations =
    options.stopBeforeOperation === undefined
      ? state.operations
      : state.operations.slice(0, options.stopBeforeOperation);
  return replayEditOperations(copySourceToCanvas(source), operations, null, {
    clipDeferredRotation: options.clipDeferredRotation !== false,
  }).canvas;
}

export function renderEditedSourceStage(
  source: ImageSource,
  state: SourceEditState,
  operationIndex: number,
): SourceEditRenderStage {
  const result = replayEditOperations(
    copySourceToCanvas(source),
    state.operations.slice(0, operationIndex),
    null,
    { clipDeferredRotation: false },
  );
  return {
    operationIndex,
    canvas: result.canvas,
    deferredRotationClip: result.deferredRotationClip,
  };
}

export function renderEditedSourceFromStage(
  stage: SourceEditRenderStage,
  state: SourceEditState,
  options: RenderSourceEditOptions = {},
): HTMLCanvasElement {
  const stopBeforeOperation = options.stopBeforeOperation ?? state.operations.length;
  return replayEditOperations(
    stage.canvas,
    state.operations.slice(stage.operationIndex, stopBeforeOperation),
    stage.deferredRotationClip,
    { clipDeferredRotation: options.clipDeferredRotation !== false },
  ).canvas;
}

interface ReplayResult {
  canvas: HTMLCanvasElement;
  deferredRotationClip: SourceEditDeferredClip | null;
}

export function drawEditorPreview(
  canvas: HTMLCanvasElement,
  source: ImageSource,
  state: SourceEditState,
  mode: SourceEditorMode,
  activeCropIndex: number | null,
  activeRotateIndex: number | null = null,
  operationBase: SourceEditRenderStage | null = null,
): EditorRenderMetrics {
  if (mode === "crop" && activeCropIndex !== null) {
    return drawCropPreview(
      canvas,
      source,
      state,
      activeCropIndex,
      operationBase?.operationIndex === activeCropIndex ? operationBase : null,
    );
  }

  if (state.operations.length === 0) {
    return drawImagePreview(canvas, source);
  }

  const rendered =
    mode === "rotate" &&
    activeRotateIndex !== null &&
    operationBase?.operationIndex === activeRotateIndex
      ? renderEditedSourceFromStage(operationBase, state, { clipDeferredRotation: true })
      : renderEditedSource(source, state, {
          clipDeferredRotation: mode !== "crop",
        });
  return drawImagePreview(canvas, rendered);
}

export function drawImagePreview(
  canvas: HTMLCanvasElement,
  source: ImageSource,
): EditorRenderMetrics {
  const { width, height } = sourceDimensions(source);
  const metrics = fitWorldToPreview(width, height);
  canvas.width = metrics.canvasWidth;
  canvas.height = metrics.canvasHeight;
  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width * metrics.scale, height * metrics.scale);
  return metrics;
}

export function canvasPointToWorld(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  metrics: EditorRenderMetrics,
): Point {
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
  const canvasY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
  return {
    x: metrics.worldX + canvasX / metrics.scale,
    y: metrics.worldY + canvasY / metrics.scale,
  };
}

export function outputCenterFromMetrics(metrics: EditorRenderMetrics): Point {
  return {
    x: metrics.worldX + metrics.worldWidth / 2,
    y: metrics.worldY + metrics.worldHeight / 2,
  };
}

export function pointAngleDegrees(point: Point, center: Point): number {
  return radiansToDegrees(Math.atan2(point.y - center.y, point.x - center.x));
}

function drawCropPreview(
  canvas: HTMLCanvasElement,
  source: ImageSource,
  state: SourceEditState,
  activeCropIndex: number,
  operationBase: SourceEditRenderStage | null,
): EditorRenderMetrics {
  const base =
    operationBase?.operationIndex === activeCropIndex
      ? operationBase.canvas
      : renderEditedSource(source, state, {
          clipDeferredRotation: false,
          stopBeforeOperation: activeCropIndex,
        });
  const operation = state.operations[activeCropIndex];
  if (!operation || operation.kind !== "crop") {
    return drawImagePreview(canvas, base);
  }

  const crop = normalizeCrop(operation, {
    x: 0,
    y: 0,
    width: base.width,
    height: base.height,
  });
  const world = cropPreviewWorld(base, crop);
  const fit = fitWorldToPreview(world.width, world.height);
  canvas.width = fit.canvasWidth;
  canvas.height = fit.canvasHeight;
  const metrics: EditorRenderMetrics = {
    scale: fit.scale,
    worldX: world.x,
    worldY: world.y,
    worldWidth: world.width,
    worldHeight: world.height,
  };

  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    base,
    (0 - world.x) * fit.scale,
    (0 - world.y) * fit.scale,
    base.width * fit.scale,
    base.height * fit.scale,
  );

  const cropLeft = (crop.x - world.x) * fit.scale;
  const cropTop = (crop.y - world.y) * fit.scale;
  const cropWidth = crop.width * fit.scale;
  const cropHeight = crop.height * fit.scale;
  drawDimmedCropOverlay(context, canvas, cropLeft, cropTop, cropWidth, cropHeight);
  drawCropGuides(context, cropLeft, cropTop, cropWidth, cropHeight);
  return metrics;
}

function replayEditOperations(
  initialCanvas: HTMLCanvasElement,
  operations: SourceEditOperation[],
  initialDeferredRotationClip: SourceEditDeferredClip | null,
  options: { clipDeferredRotation: boolean },
): ReplayResult {
  let canvas = initialCanvas;
  let deferred = initialDeferredRotationClip ? { ...initialDeferredRotationClip } : null;

  for (const operation of operations) {
    switch (operation.kind) {
      case "crop":
        canvas = renderCroppedCanvas(canvas, operation);
        deferred = null;
        break;
      case "rotate90":
        canvas = renderQuarterTurnCanvas(canvas, operation.turns);
        if (deferred && Math.abs(operation.turns) % 2 === 1) {
          [deferred.width, deferred.height] = [deferred.height, deferred.width];
        }
        break;
      case "rotateFree":
        if (Math.abs(operation.degrees) >= 0.0001) {
          const rotated = renderFreeRotatedExpandedCanvas(canvas, operation.degrees);
          deferred = deferred
            ? scaleDeferredClip(deferred, rotated.scaleX, rotated.scaleY)
            : { width: rotated.sourceWidth, height: rotated.sourceHeight };
          canvas = rotated.canvas;
        }
        break;
      case "flip":
        canvas = renderFlippedCanvas(canvas, operation.axis);
        break;
      default:
        exhaustive(operation);
    }
  }

  if (options.clipDeferredRotation && deferred) {
    canvas = renderCenteredClipCanvas(canvas, deferred.width, deferred.height);
    deferred = null;
  }

  return { canvas, deferredRotationClip: deferred };
}

function cropPreviewWorld(source: HTMLCanvasElement, crop: CropEditOperation): Rect {
  const left = Math.min(0, crop.x);
  const top = Math.min(0, crop.y);
  const right = Math.max(source.width, crop.x + crop.width);
  const bottom = Math.max(source.height, crop.y + crop.height);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function copySourceToCanvas(source: ImageSource): HTMLCanvasElement {
  const { width, height } = sourceDimensions(source);
  const target = fitSizeWithinEditorLimit(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = target.width !== width || target.height !== height;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function renderCroppedCanvas(
  source: HTMLCanvasElement,
  operation: CropEditOperation,
): HTMLCanvasElement {
  const crop = normalizeCrop(operation, {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, -crop.x, -crop.y);
  return canvas;
}

function renderFlippedCanvas(
  source: HTMLCanvasElement,
  axis: FlipEditOperation["axis"],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = requiredContext(canvas);
  context.translate(
    axis === "horizontal" ? canvas.width : 0,
    axis === "vertical" ? canvas.height : 0,
  );
  context.scale(axis === "horizontal" ? -1 : 1, axis === "vertical" ? -1 : 1);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0);
  return canvas;
}

function renderQuarterTurnCanvas(
  source: HTMLCanvasElement,
  turns: Rotate90EditOperation["turns"],
): HTMLCanvasElement {
  const normalizedTurns = ((turns % 4) + 4) % 4;
  if (normalizedTurns === 0) {
    return source;
  }

  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const context = requiredContext(canvas);
  context.imageSmoothingEnabled = false;
  if (turns > 0) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0);
  return canvas;
}

function renderFreeRotatedExpandedCanvas(
  source: HTMLCanvasElement,
  degrees: number,
): FreeRotateResult {
  const fittedSource = fitFreeRotationInputSize(source.width, source.height, degrees);
  const working =
    fittedSource.width === source.width && fittedSource.height === source.height
      ? source
      : renderResizedCanvas(source, fittedSource.width, fittedSource.height);

  const bounds = rotatedBoundingSize(working.width, working.height, degrees);
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(degreesToRadians(degrees));
  context.drawImage(working, -working.width / 2, -working.height / 2);
  return {
    canvas,
    sourceWidth: working.width,
    sourceHeight: working.height,
    scaleX: working.width / source.width,
    scaleY: working.height / source.height,
  };
}

function renderResizedCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = requiredContext(canvas);
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function renderCenteredClipCanvas(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const context = requiredContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, (canvas.width - source.width) / 2, (canvas.height - source.height) / 2);
  return canvas;
}

function drawDimmedCropOverlay(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.46)";
  context.beginPath();
  context.rect(0, 0, canvas.width, canvas.height);
  context.rect(left, top, width, height);
  context.fill("evenodd");
  context.restore();
}

function drawCropGuides(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.88)";
  context.lineWidth = 2;
  context.strokeRect(left, top, width, height);

  context.strokeStyle = "rgba(255, 255, 255, 0.5)";
  context.lineWidth = 1;
  context.beginPath();
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = left + width * fraction;
    const y = top + height * fraction;
    context.moveTo(x, top);
    context.lineTo(x, top + height);
    context.moveTo(left, y);
    context.lineTo(left + width, y);
  }
  context.stroke();

  context.fillStyle = "#ffffff";
  for (const [x, y] of [
    [left, top],
    [left + width / 2, top],
    [left + width, top],
    [left, top + height / 2],
    [left + width, top + height / 2],
    [left, top + height],
    [left + width / 2, top + height],
    [left + width, top + height],
  ]) {
    context.fillRect(x - 4, y - 4, 8, 8);
  }
  context.restore();
}

function fitWorldToPreview(
  width: number,
  height: number,
): EditorRenderMetrics & { canvasWidth: number; canvasHeight: number } {
  const maximumWidth = 960;
  const maximumHeight = 620;
  const scale = Math.min(maximumWidth / Math.max(1, width), maximumHeight / Math.max(1, height), 1);
  return {
    scale,
    worldX: 0,
    worldY: 0,
    worldWidth: width,
    worldHeight: height,
    canvasWidth: Math.max(1, Math.ceil(width * scale)),
    canvasHeight: Math.max(1, Math.ceil(height * scale)),
  };
}

function requiredContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("Canvas 2D rendering is not available");
  }
  return context;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isFullFrameCrop(
  crop: CropEditOperation,
  dimensions: { width: number; height: number },
): boolean {
  return (
    !crop.expand &&
    Math.abs(crop.x) < 0.0001 &&
    Math.abs(crop.y) < 0.0001 &&
    Math.abs(crop.width - dimensions.width) < 0.0001 &&
    Math.abs(crop.height - dimensions.height) < 0.0001
  );
}

function degreesToRadians(degrees: number): number {
  return (degrees / 180) * Math.PI;
}

function radiansToDegrees(radians: number): number {
  return (radians / Math.PI) * 180;
}

function cleanFloat(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-9 ? rounded : value;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled source edit operation: ${JSON.stringify(value)}`);
}
