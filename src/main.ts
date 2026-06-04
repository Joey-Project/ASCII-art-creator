import "./styles.css";
import type {
  ExportFormat,
  FontChoice,
  GenerateProgress,
  GlyphPack,
  Mosaic,
  RenderSettings,
} from "./domain/types";
import { GLYPH_PACKS } from "./domain/glyph-packs";
import { combineGlyphSources } from "./core/graphemes";
import { generateMosaic, recommendGridForImage } from "./core/generator";
import {
  PREVIEW_PLACEHOLDER_HEIGHT,
  PREVIEW_PLACEHOLDER_WIDTH,
  applySettingsToPreviewCanvas,
  cssFontFamily,
} from "./core/canvas";
import { colorFromString } from "./core/colors";
import { createSampleImage, loadImageFromFile } from "./core/source-image";
import {
  canvasPointToWorld,
  cloneSourceEditState,
  compactSourceEditState,
  createDefaultSourceEditState,
  defaultCropOperationForStage,
  drawEditorPreview,
  normalizeCrop,
  outputCenterFromMetrics,
  pointAngleDegrees,
  renderEditedSourceStage,
  renderEditedSource,
  resetOperations,
  sourceDimensions,
  MIN_CROP_SIZE,
  type CropEditOperation,
  type EditorRenderMetrics,
  type Point,
  type SourceEditorMode,
  type SourceEditOperation,
  type SourceEditRenderStage,
  type SourceEditState,
} from "./core/source-editor";
import {
  BUILTIN_FONTS,
  localFontAccessStatus,
  registerUploadedFonts,
  scanLocalFonts,
} from "./core/fonts";
import { exportMosaic } from "./core/exporters";

const DEFAULT_SETTINGS: RenderSettings = {
  gridMode: "dimensions",
  columns: 96,
  rows: 58,
  sourcePixelsPerGlyph: 10,
  cellWidth: 12,
  cellHeight: 16,
  fontSize: 14,
  outputScale: 2,
  colorMode: "mono",
  colorStrategy: "source",
  foreground: "#1f2528",
  background: "#f8f5ea",
  transparentBackground: false,
  useDithering: true,
  useEdgeMatching: true,
  densityWindow: 10,
};

const DEFAULT_PREVIEW_ZOOM_MULTIPLIER = 1;
const MIN_PREVIEW_ZOOM_MULTIPLIER = 0.5;
const MAX_PREVIEW_ZOOM_MULTIPLIER = 3;
const PREVIEW_ZOOM_STEP = 1.2;
const MIN_PREVIEW_RENDER_SCALE = 0.05;
const MAX_PREVIEW_RENDER_PIXELS = 12_000_000;

interface AppState {
  settings: RenderSettings;
  fonts: FontChoice[];
  enabledPacks: Set<string>;
  userGlyphs: string;
  fontSearch: string;
  fontExactMatch: boolean;
  source: HTMLImageElement | HTMLCanvasElement | null;
  sourceOriginal: HTMLImageElement | HTMLCanvasElement | null;
  sourceEdit: SourceEditState | null;
  sourceName: string;
  mosaic: Mosaic | null;
  isGenerating: boolean;
  pendingGenerateAfterCurrent: boolean;
  needsRegenerate: boolean;
  generationVersion: number;
  editor: SourceEditorSession | null;
  previewZoomMultiplier: number;
}

type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type EditorPointerState =
  | {
      kind: "crop";
      pointerId: number;
      handle: CropHandle;
      isNew: boolean;
      startPoint: Point;
      startCrop: CropEditOperation;
    }
  | {
      kind: "rotate";
      pointerId: number;
      startClient: Point;
      startDegrees: number;
    };

interface SourceEditorSession {
  original: HTMLImageElement | HTMLCanvasElement;
  sourceName: string;
  editState: SourceEditState;
  mode: SourceEditorMode;
  activeCropIndex: number | null;
  activeRotateIndex: number | null;
  operationBase: SourceEditRenderStage | null;
  renderFrameId: number | null;
  metrics: EditorRenderMetrics | null;
  pointer: EditorPointerState | null;
}

const state: AppState = {
  settings: { ...DEFAULT_SETTINGS },
  fonts: structuredClone(BUILTIN_FONTS),
  enabledPacks: new Set(GLYPH_PACKS.filter((pack) => pack.defaultEnabled).map((pack) => pack.id)),
  userGlyphs: "",
  fontSearch: "",
  fontExactMatch: false,
  source: null,
  sourceOriginal: null,
  sourceEdit: null,
  sourceName: "sample",
  mosaic: null,
  isGenerating: false,
  pendingGenerateAfterCurrent: false,
  needsRegenerate: false,
  generationVersion: 0,
  editor: null,
  previewZoomMultiplier: DEFAULT_PREVIEW_ZOOM_MULTIPLIER,
};

let imageLoadToken = 0;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing app root");
}

function nextImageLoadToken(): number {
  imageLoadToken += 1;
  return imageLoadToken;
}

app.innerHTML = `
  <main class="shell">
    <section class="panel controls" aria-label="Controls">
      <div class="brand">
        <div>
          <h1>Glyph Mosaic Creator</h1>
          <p>Static browser tool for ASCII-first typographic mosaics.</p>
        </div>
      </div>

      <div class="control-group">
        <h2>Source</h2>
        <div class="inline-actions">
          <label class="file-drop">
            <input id="image-input" type="file" accept="image/*" />
            <span>Upload image</span>
          </label>
          <button id="sample-button" class="secondary" type="button">Load sample</button>
        </div>
        <button id="edit-source" class="secondary" type="button" disabled>Edit source</button>
      </div>

      <div class="control-group">
        <h2>Glyphs</h2>
        <label>
          User glyphs
          <textarea id="glyph-input" rows="3" spellcheck="false" placeholder="Optional additions. Checked packs below still apply; uncheck ASCII to use only this field."></textarea>
        </label>
        <div id="glyph-packs" class="checkbox-grid" aria-label="Glyph packs"></div>
        <p class="hint">User glyphs are added to checked packs. To use only this field, uncheck ASCII and any other packs below.</p>
      </div>

      <div class="control-group">
        <h2>Fonts</h2>
        <div class="inline-actions">
          <label class="file-button">
            <input id="font-input" type="file" accept=".ttf,.otf,.woff,.woff2,font/*" multiple />
            Upload fonts
          </label>
          <button id="scan-fonts" class="secondary" type="button">Scan local fonts</button>
        </div>
        <p id="font-scan-hint" class="hint"></p>
        <label>
          Search fonts
          <input id="font-search" type="text" autocomplete="off" placeholder="Fuzzy match font name or source" />
        </label>
        <label class="check"><input id="font-exact-match" type="checkbox" /> Exact text match</label>
        <div id="font-list" class="font-list" aria-label="Fonts"></div>
        <div class="field-header">
          <span>Font weights</span>
          <span>applies to each selected font</span>
        </div>
        <div class="weight-row" aria-label="Font weights">
          <label><input type="checkbox" class="weight-checkbox" value="300" /> 300 Light</label>
          <label><input type="checkbox" class="weight-checkbox" value="400" checked /> 400 Regular</label>
          <label><input type="checkbox" class="weight-checkbox" value="500" /> 500 Medium</label>
          <label><input type="checkbox" class="weight-checkbox" value="700" checked /> 700 Bold</label>
          <label><input type="checkbox" class="weight-checkbox" value="900" /> 900 Black</label>
        </div>
      </div>

      <div class="control-group">
        <h2>Rendering</h2>
        <label>
          Grid mode
          <select id="grid-mode">
            <option value="dimensions">Rows x columns</option>
            <option value="source-pixels">Source pixels per glyph</option>
          </select>
        </label>
        <label>
          Columns
          <input id="columns" type="range" min="24" max="180" value="${state.settings.columns}" />
          <span id="columns-output" class="value-output">${state.settings.columns}</span>
        </label>
        <label>
          Rows
          <input id="rows" type="range" min="12" max="180" value="${state.settings.rows}" />
          <span id="rows-output" class="value-output">${state.settings.rows}</span>
        </label>
        <label>
          Source pixels per glyph
          <input id="source-pixels" type="range" min="4" max="64" value="${state.settings.sourcePixelsPerGlyph}" />
          <span id="source-pixels-output" class="value-output">${state.settings.sourcePixelsPerGlyph}</span>
        </label>
        <label>
          Cell width
          <input id="cell-width" type="number" min="6" max="28" value="${state.settings.cellWidth}" />
        </label>
        <label>
          Cell height
          <input id="cell-height" type="number" min="8" max="36" value="${state.settings.cellHeight}" />
        </label>
        <label>
          Font size
          <input id="font-size" type="number" min="7" max="34" value="${state.settings.fontSize}" />
        </label>
        <label>
          Density prefilter
          <input id="density-window" type="range" min="1" max="30" value="${state.settings.densityWindow}" />
          <span id="density-output" class="value-output">${state.settings.densityWindow}</span>
        </label>
        <label class="check"><input id="edge-matching" type="checkbox" checked /> Edge direction matching</label>
        <label class="check"><input id="dithering" type="checkbox" checked /> Dithering</label>
      </div>

      <div class="control-group">
        <h2>Color</h2>
        <div class="segmented" role="group" aria-label="Color mode">
          <button id="mono-mode" class="active" type="button">Mono</button>
          <button id="color-mode" type="button">Color</button>
        </div>
        <label>
          Color strategy
          <select id="color-strategy">
            <option value="source">Source color per cell</option>
            <option value="uniform">Uniform</option>
            <option value="glyph">By glyph</option>
            <option value="font">By font</option>
            <option value="glyph-font">By glyph x font</option>
          </select>
        </label>
        <label>
          Foreground
          <input id="foreground" type="color" value="${state.settings.foreground}" />
        </label>
        <label>
          Background
          <input id="background" type="color" value="${state.settings.background}" />
        </label>
        <label class="check"><input id="transparent" type="checkbox" /> Transparent background</label>
      </div>

      <div class="control-group">
        <h2>Export</h2>
        <label>
          Output scale
          <input id="output-scale" type="number" min="1" max="6" value="${state.settings.outputScale}" />
        </label>
        <div class="export-grid">
          <button data-export="png" type="button">PNG</button>
          <button data-export="jpeg" type="button">JPEG</button>
          <button data-export="svg" type="button">SVG</button>
          <button data-export="txt" type="button">TXT</button>
          <button data-export="pdf" type="button">PDF</button>
        </div>
      </div>
    </section>

    <section class="workspace">
      <div class="toolbar">
        <div class="toolbar-main">
          <div class="toolbar-actions">
            <button id="generate-button" type="button">Generate mosaic</button>
            <div class="zoom-controls" aria-label="Preview zoom controls">
              <button id="zoom-in" class="secondary" type="button" title="Zoom in" aria-label="Zoom in">+</button>
              <button id="zoom-fit" class="secondary" type="button" title="Fit preview" aria-label="Fit preview">Fit</button>
              <button id="zoom-out" class="secondary" type="button" title="Zoom out" aria-label="Zoom out">-</button>
            </div>
          </div>
          <div id="status" role="status" aria-live="polite">Ready</div>
        </div>
        <div id="source-editor-actions" class="source-editor-actions" hidden>
          <div class="editor-toolbar">
            <button id="crop-mode" class="secondary" type="button">Crop</button>
            <button id="rotate-mode" class="secondary" type="button">Rotate</button>
            <button id="rotate-ccw" class="secondary" type="button">CCW 90</button>
            <button id="rotate-cw" class="secondary" type="button">CW 90</button>
            <button id="flip-horizontal" class="secondary" type="button">Flip H</button>
            <button id="flip-vertical" class="secondary" type="button">Flip V</button>
            <label class="check editor-expand"><input id="crop-expand" type="checkbox" /> Expand crop</label>
            <div class="editor-commit-actions">
              <button id="cancel-source-edit" class="secondary" type="button">Cancel</button>
              <button id="confirm-source-edit" type="button">Confirm</button>
            </div>
          </div>
          <div class="editor-toolbar editor-toolbar-reset">
            <button id="reset-crop" class="secondary" type="button">Reset crop</button>
            <button id="reset-rotate" class="secondary" type="button">Reset rotate</button>
            <button id="reset-flip" class="secondary" type="button">Reset flip</button>
            <button id="reset-editor" class="secondary" type="button">Reset all</button>
            <span id="source-editor-angle" class="value-output">0 deg</span>
          </div>
        </div>
      </div>
      <section id="source-editor" class="source-editor" aria-label="Source image editor" hidden>
        <div class="editor-frame">
          <canvas id="source-editor-canvas" aria-label="Source edit preview"></canvas>
        </div>
      </section>
      <div id="preview-frame" class="preview-frame">
        <canvas id="preview-canvas" aria-label="Mosaic preview"></canvas>
      </div>
      <div class="stats">
        <span id="candidate-count">Candidates: 0</span>
        <span id="cell-count">Cells: 0</span>
        <span id="source-name">Source: none</span>
      </div>
    </section>
  </main>
`;

const previewCanvas = getElement<HTMLCanvasElement>("preview-canvas");
const sourceEditorCanvas = getElement<HTMLCanvasElement>("source-editor-canvas");
const previewFrame = getElement<HTMLDivElement>("preview-frame");
const status = getElement<HTMLDivElement>("status");
const candidateCount = getElement<HTMLSpanElement>("candidate-count");
const cellCount = getElement<HTMLSpanElement>("cell-count");
const sourceName = getElement<HTMLSpanElement>("source-name");

bindControls();
bindPreviewSizing();
renderGlyphPacks();
renderFontList();
syncUiFromState();
drawPreview();

function bindControls(): void {
  getElement<HTMLInputElement>("image-input").addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    input.value = "";
    if (state.editor) {
      setStatus("Confirm or cancel source edits before uploading another image");
      return;
    }

    const loadToken = nextImageLoadToken();
    try {
      setStatus("Loading image");
      const image = await loadImageFromFile(file);
      if (loadToken !== imageLoadToken) {
        return;
      }
      openSourceEditor(image, file.name, createDefaultSourceEditState());
      setStatus("Confirm source edits to generate");
    } catch (error) {
      if (loadToken === imageLoadToken) {
        setStatus(error instanceof Error ? error.message : "Image loading failed");
      }
    }
  });

  getElement<HTMLButtonElement>("sample-button").addEventListener("click", async () => {
    nextImageLoadToken();
    const sample = createSampleImage();
    if (state.editor) {
      closeSourceEditor();
    }
    await commitSource(sample, sample, "sample-gradient", createDefaultSourceEditState());
  });

  getElement<HTMLButtonElement>("edit-source").addEventListener("click", () => {
    if (state.editor) {
      setStatus("Confirm or cancel source edits before reopening the source editor");
      return;
    }

    if (!state.sourceOriginal || !state.sourceEdit) {
      setStatus("Upload an image or load the sample before editing");
      return;
    }

    nextImageLoadToken();
    openSourceEditor(state.sourceOriginal, state.sourceName, state.sourceEdit);
    setStatus("Editing source image");
  });

  getElement<HTMLTextAreaElement>("glyph-input").addEventListener("input", (event) => {
    state.userGlyphs = (event.target as HTMLTextAreaElement).value;
    markNeedsRegenerate();
    updateStats();
  });

  getElement<HTMLInputElement>("font-search").addEventListener("input", (event) => {
    state.fontSearch = (event.target as HTMLInputElement).value;
    renderFontList();
  });

  getElement<HTMLInputElement>("font-exact-match").addEventListener("change", (event) => {
    state.fontExactMatch = (event.target as HTMLInputElement).checked;
    renderFontList();
  });

  getElement<HTMLInputElement>("font-input").addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    setStatus("Registering uploaded fonts");
    const uploaded: FontChoice[] = [];
    let failed = 0;
    for (const file of Array.from(input.files)) {
      try {
        uploaded.push(...(await registerUploadedFonts([file])));
      } catch {
        failed += 1;
      }
    }

    if (uploaded.length === 0) {
      setStatus(failed > 0 ? "No uploaded fonts could be registered" : "No fonts selected");
      return;
    }

    state.fonts.push(...uploaded);
    renderFontList();
    markNeedsRegenerate();
    setStatus(
      `Registered ${uploaded.length} uploaded font${uploaded.length === 1 ? "" : "s"}${
        failed > 0 ? `; ${failed} failed` : ""
      }`,
    );
  });

  getElement<HTMLButtonElement>("scan-fonts").addEventListener("click", async () => {
    const button = getElement<HTMLButtonElement>("scan-fonts");
    button.disabled = true;
    try {
      setStatus("Requesting local font access");
      const localFonts = await scanLocalFonts();
      const existing = new Set(state.fonts.map((font) => `${font.source}:${font.family}`));
      const newFonts = localFonts.filter((font) => !existing.has(`${font.source}:${font.family}`));
      state.fonts.push(...newFonts);
      renderFontList();
      if (newFonts.some((font) => font.selected)) {
        markNeedsRegenerate();
      }
      setStatus(
        `Found ${newFonts.length} new local font families${
          localFonts.length > newFonts.length
            ? ` (${localFonts.length.toLocaleString()} available after scan)`
            : ""
        }`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Local font scan failed");
    } finally {
      button.disabled = false;
    }
  });

  getElement<HTMLInputElement>("columns").addEventListener("input", (event) => {
    state.settings.columns = Number((event.target as HTMLInputElement).value);
    setOutput("columns-output", state.settings.columns);
    markNeedsRegenerate();
  });
  getElement<HTMLInputElement>("rows").addEventListener("input", (event) => {
    state.settings.rows = Number((event.target as HTMLInputElement).value);
    setOutput("rows-output", state.settings.rows);
    markNeedsRegenerate();
  });
  getElement<HTMLInputElement>("source-pixels").addEventListener("input", (event) => {
    state.settings.sourcePixelsPerGlyph = Number((event.target as HTMLInputElement).value);
    setOutput("source-pixels-output", state.settings.sourcePixelsPerGlyph);
    markNeedsRegenerate();
  });
  getElement<HTMLSelectElement>("grid-mode").addEventListener("change", (event) => {
    state.settings.gridMode = (event.target as HTMLSelectElement)
      .value as RenderSettings["gridMode"];
    syncGridMode();
    markNeedsRegenerate();
  });
  getElement<HTMLInputElement>("cell-width").addEventListener(
    "input",
    cellMetricSetting("cellWidth"),
  );
  getElement<HTMLInputElement>("cell-height").addEventListener(
    "input",
    cellMetricSetting("cellHeight"),
  );
  getElement<HTMLInputElement>("font-size").addEventListener("input", fontSizeSetting());
  getElement<HTMLInputElement>("density-window").addEventListener("input", (event) => {
    state.settings.densityWindow = Number((event.target as HTMLInputElement).value);
    setOutput("density-output", state.settings.densityWindow);
    markNeedsRegenerate();
  });
  getElement<HTMLInputElement>("edge-matching").addEventListener("change", (event) => {
    state.settings.useEdgeMatching = (event.target as HTMLInputElement).checked;
    markNeedsRegenerate();
  });
  getElement<HTMLInputElement>("dithering").addEventListener("change", (event) => {
    state.settings.useDithering = (event.target as HTMLInputElement).checked;
    markNeedsRegenerate();
  });

  getElement<HTMLButtonElement>("mono-mode").addEventListener("click", () => {
    state.settings.colorMode = "mono";
    syncColorModeButtons();
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLButtonElement>("color-mode").addEventListener("click", () => {
    state.settings.colorMode = "color";
    syncColorModeButtons();
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLSelectElement>("color-strategy").addEventListener("change", (event) => {
    state.settings.colorStrategy = (event.target as HTMLSelectElement)
      .value as RenderSettings["colorStrategy"];
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLInputElement>("foreground").addEventListener("input", (event) => {
    state.settings.foreground = (event.target as HTMLInputElement).value;
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLInputElement>("background").addEventListener("input", (event) => {
    state.settings.background = (event.target as HTMLInputElement).value;
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLInputElement>("transparent").addEventListener("change", (event) => {
    state.settings.transparentBackground = (event.target as HTMLInputElement).checked;
    applyVisualSettingsToMosaic();
  });
  getElement<HTMLInputElement>("output-scale").addEventListener(
    "input",
    numberSetting("outputScale"),
  );

  for (const checkbox of document.querySelectorAll<HTMLInputElement>(".weight-checkbox")) {
    checkbox.addEventListener("change", () => {
      const weights = selectedWeights();
      for (const font of state.fonts) {
        font.weights = weights;
      }
      renderFontList();
      markNeedsRegenerate();
    });
  }

  getElement<HTMLButtonElement>("generate-button").addEventListener("click", () => {
    void generate();
  });

  getElement<HTMLButtonElement>("crop-mode").addEventListener("click", () => {
    toggleEditorMode("crop");
  });
  getElement<HTMLButtonElement>("rotate-mode").addEventListener("click", () => {
    toggleEditorMode("rotate");
  });
  getElement<HTMLButtonElement>("rotate-ccw").addEventListener("click", () => {
    appendEditorOperation({ kind: "rotate90", turns: -1 });
  });
  getElement<HTMLButtonElement>("rotate-cw").addEventListener("click", () => {
    appendEditorOperation({ kind: "rotate90", turns: 1 });
  });
  getElement<HTMLButtonElement>("flip-horizontal").addEventListener("click", () => {
    appendEditorOperation({ kind: "flip", axis: "horizontal" });
  });
  getElement<HTMLButtonElement>("flip-vertical").addEventListener("click", () => {
    appendEditorOperation({ kind: "flip", axis: "vertical" });
  });
  getElement<HTMLInputElement>("crop-expand").addEventListener("change", (event) => {
    const checked = (event.target as HTMLInputElement).checked;
    const editor = state.editor;
    if (!editor) {
      return;
    }
    if (editor.mode !== "crop") {
      editor.mode = "crop";
    }
    ensureCropOperation(editor);
    if (editor.activeCropIndex === null) {
      return;
    }
    const operation = editor.editState.operations[editor.activeCropIndex];
    if (operation?.kind === "crop") {
      operation.expand = checked;
      normalizeActiveCrop(editor);
      renderSourceEditor();
    }
  });
  getElement<HTMLButtonElement>("reset-crop").addEventListener("click", () => {
    resetEditorOperations("crop");
  });
  getElement<HTMLButtonElement>("reset-rotate").addEventListener("click", () => {
    resetEditorOperations("rotate");
  });
  getElement<HTMLButtonElement>("reset-flip").addEventListener("click", () => {
    resetEditorOperations("flip");
  });
  getElement<HTMLButtonElement>("reset-editor").addEventListener("click", () => {
    resetEditorOperations("all");
  });
  getElement<HTMLButtonElement>("cancel-source-edit").addEventListener("click", () => {
    closeSourceEditor({ drainPendingGenerate: true });
    setStatus(state.source ? "Source edit cancelled" : "Upload cancelled");
  });
  getElement<HTMLButtonElement>("confirm-source-edit").addEventListener("click", () => {
    void confirmSourceEditor();
  });
  sourceEditorCanvas.addEventListener("pointerdown", handleEditorPointerDown);
  sourceEditorCanvas.addEventListener("pointermove", handleEditorPointerMove);
  sourceEditorCanvas.addEventListener("pointerup", handleEditorPointerEnd);
  sourceEditorCanvas.addEventListener("pointercancel", handleEditorPointerEnd);

  getElement<HTMLButtonElement>("zoom-in").addEventListener("click", () => {
    zoomPreviewBy(PREVIEW_ZOOM_STEP);
  });
  getElement<HTMLButtonElement>("zoom-out").addEventListener("click", () => {
    zoomPreviewBy(1 / PREVIEW_ZOOM_STEP);
  });
  getElement<HTMLButtonElement>("zoom-fit").addEventListener("click", () => {
    resetPreviewZoom();
  });
  previewFrame.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      zoomPreviewBy(event.deltaY < 0 ? PREVIEW_ZOOM_STEP : 1 / PREVIEW_ZOOM_STEP);
    },
    { passive: false },
  );

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
    button.addEventListener("click", async () => {
      if (state.editor) {
        setStatus("Confirm or cancel source edits before exporting");
        return;
      }

      if (!state.mosaic) {
        setStatus("Generate a mosaic before exporting");
        return;
      }

      if (state.needsRegenerate) {
        setStatus("Regenerate the mosaic before exporting structural changes");
        return;
      }

      try {
        await exportMosaic(state.mosaic, {
          format: button.dataset.export as ExportFormat,
          scale: state.settings.outputScale,
        });
        setStatus(`Exported ${button.dataset.export?.toUpperCase()}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Export failed");
      }
    });
  }
}

function openSourceEditor(
  original: HTMLImageElement | HTMLCanvasElement,
  sourceNameValue: string,
  editState: SourceEditState,
): void {
  if (state.editor?.renderFrameId != null) {
    cancelAnimationFrame(state.editor.renderFrameId);
  }
  state.editor = {
    original,
    sourceName: sourceNameValue,
    editState: cloneSourceEditState(editState),
    mode: "idle",
    activeCropIndex: null,
    activeRotateIndex: null,
    operationBase: null,
    renderFrameId: null,
    metrics: null,
    pointer: null,
  };
  getElement<HTMLElement>("source-editor").hidden = false;
  getElement<HTMLElement>("source-editor-actions").hidden = false;
  getElement<HTMLButtonElement>("generate-button").disabled = true;
  syncEditSourceButton();
  renderSourceEditor();
}

function closeSourceEditor(options: { drainPendingGenerate?: boolean } = {}): void {
  const editor = state.editor;
  if (editor?.renderFrameId != null) {
    cancelAnimationFrame(editor.renderFrameId);
  }
  nextImageLoadToken();
  state.editor = null;
  getElement<HTMLElement>("source-editor").hidden = true;
  getElement<HTMLElement>("source-editor-actions").hidden = true;
  getElement<HTMLButtonElement>("generate-button").disabled = state.isGenerating;
  syncEditSourceButton();
  if (options.drainPendingGenerate && state.pendingGenerateAfterCurrent && !state.isGenerating) {
    state.pendingGenerateAfterCurrent = false;
    void generate();
  }
}

async function confirmSourceEditor(): Promise<void> {
  const editor = state.editor;
  if (!editor) {
    return;
  }

  try {
    setStatus("Applying source edits");
    const compactedEditState = compactSourceEditState(editor.original, editor.editState);
    const rendered =
      compactedEditState.operations.length === 0
        ? editor.original
        : renderEditedSource(editor.original, compactedEditState);
    const original = editor.original;
    const editState = cloneSourceEditState(compactedEditState);
    const name = editor.sourceName;
    const recommendGrid = shouldRecommendGridForConfirmedSource(original, rendered);
    closeSourceEditor();
    await commitSource(rendered, original, name, editState, { recommendGrid });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Source edit failed");
  }
}

function shouldRecommendGridForConfirmedSource(
  original: HTMLImageElement | HTMLCanvasElement,
  rendered: HTMLImageElement | HTMLCanvasElement,
): boolean {
  if (original !== state.sourceOriginal || !state.source) {
    return true;
  }

  const previous = sourceDimensions(state.source);
  const next = sourceDimensions(rendered);
  return previous.width !== next.width || previous.height !== next.height;
}

async function commitSource(
  source: HTMLImageElement | HTMLCanvasElement,
  original: HTMLImageElement | HTMLCanvasElement,
  sourceNameValue: string,
  editState: SourceEditState,
  options: { recommendGrid?: boolean } = {},
): Promise<void> {
  state.source = source;
  state.sourceOriginal = original;
  state.sourceEdit = cloneSourceEditState(editState);
  state.sourceName = sourceNameValue;
  state.mosaic = null;
  state.needsRegenerate = false;
  state.generationVersion += 1;
  state.pendingGenerateAfterCurrent = false;
  if (options.recommendGrid !== false) {
    applyRecommendedGrid(source);
  }
  syncEditSourceButton();
  updateStats();
  drawPreview();
  await generate();
}

function toggleEditorMode(mode: SourceEditorMode): void {
  const editor = state.editor;
  if (!editor) {
    setStatus("Upload an image before editing");
    return;
  }

  if (editor.mode === mode) {
    editor.mode = "idle";
    editor.activeCropIndex = null;
    editor.activeRotateIndex = null;
    editor.operationBase = null;
    editor.pointer = null;
  } else {
    editor.mode = mode;
    editor.pointer = null;
    if (mode === "crop") {
      ensureCropOperation(editor);
      editor.activeRotateIndex = null;
    } else if (mode === "rotate") {
      ensureRotateOperation(editor);
      editor.activeCropIndex = null;
    }
  }

  renderSourceEditor();
}

function appendEditorOperation(operation: SourceEditOperation): void {
  const editor = state.editor;
  if (!editor) {
    setStatus("Upload an image before editing");
    return;
  }

  editor.editState.operations.push(operation);
  editor.mode = "idle";
  editor.activeCropIndex = null;
  editor.activeRotateIndex = null;
  editor.operationBase = null;
  editor.pointer = null;
  renderSourceEditor();
}

function resetEditorOperations(group: "all" | "crop" | "rotate" | "flip"): void {
  const editor = state.editor;
  if (!editor) {
    return;
  }

  editor.editState = resetOperations(editor.editState, group);
  editor.mode = "idle";
  editor.activeCropIndex = null;
  editor.activeRotateIndex = null;
  editor.operationBase = null;
  editor.pointer = null;
  renderSourceEditor();
}

function ensureCropOperation(editor: SourceEditorSession): void {
  const lastIndex = editor.editState.operations.length - 1;
  const lastOperation = editor.editState.operations[lastIndex];
  if (lastOperation?.kind === "crop") {
    editor.activeCropIndex = lastIndex;
    cacheOperationBase(editor, lastIndex);
    return;
  }

  const base = renderEditedSourceStage(
    editor.original,
    editor.editState,
    editor.editState.operations.length,
  );
  editor.editState.operations.push(defaultCropOperationForStage(base));
  editor.activeCropIndex = editor.editState.operations.length - 1;
  editor.operationBase = base;
}

function cacheOperationBase(
  editor: SourceEditorSession,
  operationIndex: number,
): SourceEditRenderStage {
  if (editor.operationBase?.operationIndex === operationIndex) {
    return editor.operationBase;
  }

  const base = renderEditedSourceStage(editor.original, editor.editState, operationIndex);
  editor.operationBase = base;
  return base;
}

function currentCropBaseDimensions(editor: SourceEditorSession): { width: number; height: number } {
  if (editor.activeCropIndex === null) {
    return { width: 1, height: 1 };
  }

  const base = cacheOperationBase(editor, editor.activeCropIndex);
  return {
    width: base.canvas.width,
    height: base.canvas.height,
  };
}

function scheduleSourceEditorRender(): void {
  const editor = state.editor;
  if (!editor || editor.renderFrameId !== null) {
    return;
  }

  editor.renderFrameId = requestAnimationFrame(() => {
    const activeEditor = state.editor;
    if (!activeEditor) {
      return;
    }
    activeEditor.renderFrameId = null;
    renderSourceEditor();
  });
}

function setOperationBase(
  editor: SourceEditorSession,
  operationIndex: number,
  base: SourceEditRenderStage,
): void {
  editor.operationBase = {
    ...base,
    operationIndex,
  };
}

function ensureRotateOperation(editor: SourceEditorSession): void {
  const lastIndex = editor.editState.operations.length - 1;
  const lastOperation = editor.editState.operations[lastIndex];
  if (lastOperation?.kind === "rotateFree") {
    editor.activeRotateIndex = lastIndex;
    cacheOperationBase(editor, lastIndex);
    return;
  }

  const base = renderEditedSourceStage(
    editor.original,
    editor.editState,
    editor.editState.operations.length,
  );
  editor.editState.operations.push({ kind: "rotateFree", degrees: 0 });
  editor.activeRotateIndex = editor.editState.operations.length - 1;
  setOperationBase(editor, editor.activeRotateIndex, base);
}

function renderSourceEditor(): void {
  const editor = state.editor;
  if (!editor) {
    return;
  }

  if (editor.renderFrameId != null) {
    cancelAnimationFrame(editor.renderFrameId);
    editor.renderFrameId = null;
  }

  editor.metrics = drawEditorPreview(
    sourceEditorCanvas,
    editor.original,
    editor.editState,
    editor.mode,
    editor.activeCropIndex,
    editor.activeRotateIndex,
    editor.operationBase,
  );
  syncSourceEditorControls(editor);
}

function syncSourceEditorControls(editor: SourceEditorSession): void {
  getElement<HTMLButtonElement>("crop-mode").classList.toggle("active", editor.mode === "crop");
  getElement<HTMLButtonElement>("rotate-mode").classList.toggle("active", editor.mode === "rotate");

  const cropExpand = getElement<HTMLInputElement>("crop-expand");
  const cropOperation =
    editor.activeCropIndex === null ? null : editor.editState.operations[editor.activeCropIndex];
  cropExpand.disabled = cropOperation?.kind !== "crop";
  cropExpand.checked = cropOperation?.kind === "crop" ? cropOperation.expand : false;

  const rotateOperation =
    editor.activeRotateIndex === null
      ? null
      : editor.editState.operations[editor.activeRotateIndex];
  getElement<HTMLSpanElement>("source-editor-angle").textContent =
    rotateOperation?.kind === "rotateFree" ? `${Math.round(rotateOperation.degrees)} deg` : "0 deg";
}

function syncEditSourceButton(): void {
  getElement<HTMLButtonElement>("edit-source").disabled =
    Boolean(state.editor) || !state.sourceOriginal || !state.sourceEdit;
}

function worldPointToClient(
  canvas: HTMLCanvasElement,
  metrics: EditorRenderMetrics,
  point: Point,
): Point {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (point.x - metrics.worldX) * metrics.scale;
  const canvasY = (point.y - metrics.worldY) * metrics.scale;
  return {
    x: rect.left + (canvasX / Math.max(1, canvas.width)) * rect.width,
    y: rect.top + (canvasY / Math.max(1, canvas.height)) * rect.height,
  };
}

function handleEditorPointerDown(event: PointerEvent): void {
  const editor = state.editor;
  if (!editor?.metrics) {
    return;
  }

  const point = canvasPointToWorld(event, sourceEditorCanvas, editor.metrics);
  if (editor.mode === "crop" && editor.activeCropIndex !== null) {
    const operation = editor.editState.operations[editor.activeCropIndex];
    if (operation?.kind !== "crop") {
      return;
    }

    normalizeActiveCrop(editor);
    const handle = cropHandleAtPoint(point, operation, editor.metrics, sourceEditorCanvas);
    const startCrop =
      handle === null
        ? { ...operation, x: point.x, y: point.y, width: MIN_CROP_SIZE, height: MIN_CROP_SIZE }
        : { ...operation };
    if (handle === null) {
      Object.assign(operation, startCrop);
    }
    editor.pointer = {
      kind: "crop",
      pointerId: event.pointerId,
      handle: handle ?? "se",
      isNew: handle === null,
      startPoint: point,
      startCrop,
    };
    sourceEditorCanvas.setPointerCapture(event.pointerId);
    renderSourceEditor();
    return;
  }

  if (editor.mode === "rotate") {
    ensureRotateOperation(editor);
    const active = editor.activeRotateIndex;
    const operation = active === null ? null : editor.editState.operations[active];
    if (operation?.kind !== "rotateFree") {
      return;
    }

    editor.pointer = {
      kind: "rotate",
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startDegrees: operation.degrees,
    };
    sourceEditorCanvas.setPointerCapture(event.pointerId);
  }
}

function handleEditorPointerMove(event: PointerEvent): void {
  const editor = state.editor;
  if (!editor?.pointer || editor.pointer.pointerId !== event.pointerId || !editor.metrics) {
    return;
  }

  const point = canvasPointToWorld(event, sourceEditorCanvas, editor.metrics);
  if (editor.pointer.kind === "crop") {
    updateCropFromPointer(editor, point);
    scheduleSourceEditorRender();
    return;
  }

  const active = editor.activeRotateIndex;
  const operation = active === null ? null : editor.editState.operations[active];
  if (operation?.kind !== "rotateFree") {
    return;
  }

  const center = outputCenterFromMetrics(editor.metrics);
  const centerClient = worldPointToClient(sourceEditorCanvas, editor.metrics, center);
  const startAngle = pointAngleDegrees(editor.pointer.startClient, centerClient);
  const currentAngle = pointAngleDegrees({ x: event.clientX, y: event.clientY }, centerClient);
  operation.degrees = editor.pointer.startDegrees + normalizeAngle(currentAngle - startAngle);
  scheduleSourceEditorRender();
}

function handleEditorPointerEnd(event: PointerEvent): void {
  const editor = state.editor;
  if (!editor?.pointer || editor.pointer.pointerId !== event.pointerId) {
    return;
  }

  editor.pointer = null;
  if (sourceEditorCanvas.hasPointerCapture(event.pointerId)) {
    sourceEditorCanvas.releasePointerCapture(event.pointerId);
  }
}

function normalizeActiveCrop(editor: SourceEditorSession): void {
  if (editor.activeCropIndex === null) {
    return;
  }

  const operation = editor.editState.operations[editor.activeCropIndex];
  if (operation?.kind !== "crop") {
    return;
  }

  const base = currentCropBaseDimensions(editor);
  Object.assign(
    operation,
    normalizeCrop(operation, {
      x: 0,
      y: 0,
      width: base.width,
      height: base.height,
    }),
  );
}

function updateCropFromPointer(editor: SourceEditorSession, point: Point): void {
  if (editor.activeCropIndex === null || editor.pointer?.kind !== "crop") {
    return;
  }

  const operation = editor.editState.operations[editor.activeCropIndex];
  if (operation?.kind !== "crop") {
    return;
  }

  const pointer = editor.pointer;
  const next = pointer.isNew
    ? newCropFromDrag(pointer.startCrop, pointer.startPoint, point)
    : resizedCrop(
        pointer.startCrop,
        pointer.handle,
        point.x - pointer.startPoint.x,
        point.y - pointer.startPoint.y,
      );
  const base = currentCropBaseDimensions(editor);
  Object.assign(
    operation,
    normalizeCrop(next, {
      x: 0,
      y: 0,
      width: base.width,
      height: base.height,
    }),
  );
}

function newCropFromDrag(
  crop: CropEditOperation,
  startPoint: Point,
  point: Point,
): CropEditOperation {
  const growsLeft = point.x < startPoint.x;
  const growsUp = point.y < startPoint.y;
  const width = Math.max(MIN_CROP_SIZE, Math.abs(point.x - startPoint.x));
  const height = Math.max(MIN_CROP_SIZE, Math.abs(point.y - startPoint.y));
  return {
    ...crop,
    x: growsLeft ? startPoint.x - width : startPoint.x,
    y: growsUp ? startPoint.y - height : startPoint.y,
    width,
    height,
  };
}

function resizedCrop(
  crop: CropEditOperation,
  handle: CropHandle,
  dx: number,
  dy: number,
): CropEditOperation {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle === "move") {
    left += dx;
    right += dx;
    top += dy;
    bottom += dy;
  } else {
    if (handle.includes("w")) {
      left += dx;
    }
    if (handle.includes("e")) {
      right += dx;
    }
    if (handle.includes("n")) {
      top += dy;
    }
    if (handle.includes("s")) {
      bottom += dy;
    }
  }

  if (right - left < MIN_CROP_SIZE) {
    if (handle.includes("w")) {
      left = right - MIN_CROP_SIZE;
    } else {
      right = left + MIN_CROP_SIZE;
    }
  }
  if (bottom - top < MIN_CROP_SIZE) {
    if (handle.includes("n")) {
      top = bottom - MIN_CROP_SIZE;
    } else {
      bottom = top + MIN_CROP_SIZE;
    }
  }

  return {
    ...crop,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function cropHandleAtPoint(
  point: Point,
  crop: CropEditOperation,
  metrics: EditorRenderMetrics,
  canvas: HTMLCanvasElement,
): CropHandle | null {
  const tolerance = worldToleranceForCssPixels(canvas, metrics, 14);
  const left = crop.x;
  const top = crop.y;
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const nearLeft = Math.abs(point.x - left) <= tolerance.x;
  const nearRight = Math.abs(point.x - right) <= tolerance.x;
  const nearTop = Math.abs(point.y - top) <= tolerance.y;
  const nearBottom = Math.abs(point.y - bottom) <= tolerance.y;
  const insideX = point.x >= left - tolerance.x && point.x <= right + tolerance.x;
  const insideY = point.y >= top - tolerance.y && point.y <= bottom + tolerance.y;

  if (nearLeft && nearTop) {
    return "nw";
  }
  if (nearRight && nearTop) {
    return "ne";
  }
  if (nearLeft && nearBottom) {
    return "sw";
  }
  if (nearRight && nearBottom) {
    return "se";
  }
  if (nearLeft && insideY) {
    return "w";
  }
  if (nearRight && insideY) {
    return "e";
  }
  if (nearTop && insideX) {
    return "n";
  }
  if (nearBottom && insideX) {
    return "s";
  }
  if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
    return "move";
  }
  return null;
}

function worldToleranceForCssPixels(
  canvas: HTMLCanvasElement,
  metrics: EditorRenderMetrics,
  cssPixels: number,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cssPixels * canvas.width) / Math.max(1, rect.width) / metrics.scale,
    y: (cssPixels * canvas.height) / Math.max(1, rect.height) / metrics.scale,
  };
}

function normalizeAngle(degrees: number): number {
  let normalized = degrees;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

function bindPreviewSizing(): void {
  const resizeObserver = new ResizeObserver(() => {
    drawPreview();
  });
  resizeObserver.observe(previewFrame);
}

function renderGlyphPacks(): void {
  const container = getElement<HTMLDivElement>("glyph-packs");
  container.innerHTML = "";

  for (const pack of GLYPH_PACKS) {
    const label = document.createElement("label");
    label.title = pack.description;
    label.innerHTML = `<input type="checkbox" value="${pack.id}" ${state.enabledPacks.has(pack.id) ? "checked" : ""} /> ${pack.label}`;
    label.querySelector("input")!.addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      if (checked) {
        state.enabledPacks.add(pack.id);
      } else {
        state.enabledPacks.delete(pack.id);
      }
      markNeedsRegenerate();
      updateStats();
    });
    container.append(label);
  }
}

function renderFontList(): void {
  const container = getElement<HTMLDivElement>("font-list");
  container.innerHTML = "";
  const matchingFonts = state.fonts.filter((font) =>
    fontMatchesSearch(font, state.fontSearch, state.fontExactMatch),
  );

  for (const font of matchingFonts) {
    const label = document.createElement("label");
    label.className = "font-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = font.selected;

    const fontName = document.createElement("span");
    fontName.className = "font-name";
    fontName.style.fontFamily = cssFontFamily(font.family);
    fontName.textContent = font.label;

    const fontSource = document.createElement("span");
    fontSource.className = "font-source";
    fontSource.textContent = font.source;

    const fontWeights = document.createElement("span");
    fontWeights.className = "font-weights";
    fontWeights.textContent = font.weights.join(", ");

    checkbox.addEventListener("change", (event) => {
      font.selected = (event.target as HTMLInputElement).checked;
      markNeedsRegenerate();
      updateStats();
    });
    label.append(checkbox, fontName, fontSource, fontWeights);
    container.append(label);
  }

  if (matchingFonts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No fonts match this search.";
    container.append(empty);
  }

  const access = localFontAccessStatus();
  const scanButton = getElement<HTMLButtonElement>("scan-fonts");
  scanButton.disabled = !access.available;
  scanButton.title = access.reason;
  const hiddenSelectedCount = state.fonts.filter(
    (font) => font.selected && !fontMatchesSearch(font, state.fontSearch, state.fontExactMatch),
  ).length;
  const hiddenSelectedText =
    hiddenSelectedCount > 0
      ? ` ${hiddenSelectedCount.toLocaleString()} selected ${hiddenSelectedCount === 1 ? "font is" : "fonts are"} hidden by search and still included in generation.`
      : "";
  getElement<HTMLParagraphElement>("font-scan-hint").textContent =
    `${access.reason} Showing ${matchingFonts.length.toLocaleString()} of ${state.fonts.length.toLocaleString()} fonts.${hiddenSelectedText}`;
  updateStats();
}

function fontMatchesSearch(font: FontChoice, query: string, exactMatch: boolean): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearch(`${font.label} ${font.family} ${font.source}`);
  if (exactMatch) {
    return haystack.includes(normalizedQuery);
  }

  return fuzzyIncludes(haystack, normalizedQuery);
}

function fuzzyIncludes(value: string, query: string): boolean {
  let cursor = 0;
  for (const char of query) {
    cursor = value.indexOf(char, cursor);
    if (cursor === -1) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function syncUiFromState(): void {
  getElement<HTMLTextAreaElement>("glyph-input").value = state.userGlyphs;
  getElement<HTMLInputElement>("font-search").value = state.fontSearch;
  getElement<HTMLInputElement>("font-exact-match").checked = state.fontExactMatch;
  getElement<HTMLSelectElement>("grid-mode").value = state.settings.gridMode;
  syncColorModeButtons();
  syncGridMode();
  syncEditSourceButton();
  updateStats();
}

function syncGridMode(): void {
  const dimensions = state.settings.gridMode === "dimensions";
  getElement<HTMLInputElement>("columns").disabled = !dimensions;
  getElement<HTMLInputElement>("rows").disabled = !dimensions;
  getElement<HTMLInputElement>("source-pixels").disabled = dimensions;
}

function syncColorModeButtons(): void {
  getElement<HTMLButtonElement>("mono-mode").classList.toggle(
    "active",
    state.settings.colorMode === "mono",
  );
  getElement<HTMLButtonElement>("color-mode").classList.toggle(
    "active",
    state.settings.colorMode === "color",
  );
}

async function generate(): Promise<void> {
  if (state.editor) {
    setStatus("Confirm or cancel source edits before generating");
    return;
  }

  if (state.isGenerating) {
    state.pendingGenerateAfterCurrent = true;
    setStatus("Generation is already running; queued another pass");
    return;
  }

  if (!state.source) {
    const sample = createSampleImage();
    state.source = sample;
    state.sourceOriginal = sample;
    state.sourceEdit = createDefaultSourceEditState();
    state.sourceName = "sample-gradient";
    syncEditSourceButton();
  }

  const sourceSnapshot = state.source;
  const sourceNameSnapshot = state.sourceName;
  const settingsSnapshot: RenderSettings = { ...state.settings };
  const fontsSnapshot = cloneFonts(state.fonts);
  const glyphs = activeGlyphs();
  const generationVersion = state.generationVersion;
  if (glyphs.length === 0) {
    setStatus("Add at least one glyph");
    return;
  }

  const selectedFonts = fontsSnapshot.filter((font) => font.selected);
  if (selectedFonts.length === 0) {
    setStatus("Select at least one font");
    return;
  }

  state.isGenerating = true;
  getElement<HTMLButtonElement>("generate-button").disabled = true;

  try {
    const mosaic = await generateMosaic({
      source: sourceSnapshot,
      sourceName: sourceNameSnapshot,
      glyphs,
      fonts: fontsSnapshot,
      settings: settingsSnapshot,
      onProgress: (progress) => {
        if (generationVersion === state.generationVersion) {
          renderProgress(progress);
        }
      },
    });
    if (generationVersion !== state.generationVersion) {
      setStatus("Settings changed during generation; generate again to apply the latest inputs");
      return;
    }

    state.mosaic = mosaic;
    state.needsRegenerate = false;
    resetPreviewZoom({ draw: false });
    syncMosaicVisualSettings(state.mosaic, state.settings);
    drawPreview();
    updateStats();
    setStatus("Mosaic ready");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Generation failed");
  } finally {
    state.isGenerating = false;
    getElement<HTMLButtonElement>("generate-button").disabled = Boolean(state.editor);
    if (state.pendingGenerateAfterCurrent && !state.editor) {
      state.pendingGenerateAfterCurrent = false;
      void generate();
    }
  }
}

function activeGlyphs(): string[] {
  const packGlyphs = GLYPH_PACKS.filter((pack: GlyphPack) => state.enabledPacks.has(pack.id)).map(
    (pack) => pack.glyphs,
  );
  return combineGlyphSources([...packGlyphs, state.userGlyphs]);
}

function selectedWeights(): number[] {
  const weights = Array.from(
    document.querySelectorAll<HTMLInputElement>(".weight-checkbox:checked"),
  ).map((input) => Number(input.value));
  return weights.length > 0 ? weights : [400];
}

function drawPreview(): void {
  applySettingsToPreviewCanvas(previewCanvas, state.mosaic, state.settings, currentPreviewScale());
  syncPreviewZoomControls();
}

function zoomPreviewBy(factor: number): void {
  state.previewZoomMultiplier = clampPreviewZoomMultiplier(state.previewZoomMultiplier * factor);
  drawPreview();
}

function resetPreviewZoom(options: { draw?: boolean } = {}): void {
  state.previewZoomMultiplier = DEFAULT_PREVIEW_ZOOM_MULTIPLIER;
  if (options.draw !== false) {
    drawPreview();
  }
}

function currentPreviewScale(): number {
  const naturalSize = previewNaturalSize();
  const rawScale = containPreviewScale(naturalSize) * state.previewZoomMultiplier;
  const pixelCappedScale = Math.sqrt(
    MAX_PREVIEW_RENDER_PIXELS / Math.max(1, naturalSize.width * naturalSize.height),
  );
  return Math.max(MIN_PREVIEW_RENDER_SCALE, Math.min(rawScale, pixelCappedScale));
}

function containPreviewScale(naturalSize: { width: number; height: number }): number {
  const frameStyle = window.getComputedStyle(previewFrame);
  const canvasStyle = window.getComputedStyle(previewCanvas);
  const horizontalInset =
    cssPixels(frameStyle.paddingLeft) +
    cssPixels(frameStyle.paddingRight) +
    cssPixels(canvasStyle.borderLeftWidth) +
    cssPixels(canvasStyle.borderRightWidth);
  const verticalInset =
    cssPixels(frameStyle.paddingTop) +
    cssPixels(frameStyle.paddingBottom) +
    cssPixels(canvasStyle.borderTopWidth) +
    cssPixels(canvasStyle.borderBottomWidth);
  const frameWidth = previewFrame.clientWidth - horizontalInset;
  const frameHeight = previewFrame.clientHeight - verticalInset;
  if (frameWidth <= 0 || frameHeight <= 0) {
    return 1;
  }

  return Math.min(1, frameWidth / naturalSize.width, frameHeight / naturalSize.height);
}

function cssPixels(value: string): number {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
}

function previewNaturalSize(): { width: number; height: number } {
  if (!state.mosaic) {
    return { width: PREVIEW_PLACEHOLDER_WIDTH, height: PREVIEW_PLACEHOLDER_HEIGHT };
  }

  return {
    width: Math.max(1, state.mosaic.columns * state.mosaic.cellWidth),
    height: Math.max(1, state.mosaic.rows * state.mosaic.cellHeight),
  };
}

function syncPreviewZoomControls(): void {
  const percent = Math.round(currentPreviewScale() * 100);
  getElement<HTMLButtonElement>("zoom-fit").title = `Fit preview (${percent}%)`;
  getElement<HTMLButtonElement>("zoom-out").disabled =
    state.previewZoomMultiplier <= MIN_PREVIEW_ZOOM_MULTIPLIER;
  getElement<HTMLButtonElement>("zoom-in").disabled =
    state.previewZoomMultiplier >= MAX_PREVIEW_ZOOM_MULTIPLIER;
}

function clampPreviewZoomMultiplier(value: number): number {
  return Math.max(MIN_PREVIEW_ZOOM_MULTIPLIER, Math.min(MAX_PREVIEW_ZOOM_MULTIPLIER, value));
}

function applyVisualSettingsToMosaic(): void {
  if (!state.mosaic) {
    drawPreview();
    return;
  }

  syncMosaicVisualSettings(state.mosaic, state.settings);
  drawPreview();
  setStatus(
    state.needsRegenerate
      ? "Visual settings updated; regenerate structural changes"
      : "Visual settings updated",
  );
}

function syncMosaicVisualSettings(mosaic: Mosaic, settings: RenderSettings): void {
  mosaic.cellWidth = settings.cellWidth;
  mosaic.cellHeight = settings.cellHeight;
  mosaic.fontSize = settings.fontSize;
  mosaic.background = settings.background;
  mosaic.transparentBackground = settings.transparentBackground;

  for (const cell of mosaic.cells) {
    cell.background = settings.background;
    cell.foreground = visualForegroundForCell(cell, settings);
  }
}

function visualForegroundForCell(cell: Mosaic["cells"][number], settings: RenderSettings): string {
  if (settings.colorMode === "mono") {
    return settings.foreground;
  }

  switch (settings.colorStrategy) {
    case "source":
      return cell.sourceColor;
    case "uniform":
      return settings.foreground;
    case "glyph":
      return colorFromString(cell.glyph);
    case "font":
      return colorFromString(cell.fontFamily);
    case "glyph-font":
      return colorFromString(`${cell.glyph}:${cell.fontFamily}:${cell.weight}`);
    default:
      return settings.foreground;
  }
}

function markNeedsRegenerate(): void {
  state.generationVersion += 1;
  if (state.mosaic) {
    state.needsRegenerate = true;
    setStatus("Settings changed; regenerate the mosaic before exporting");
  } else if (state.isGenerating) {
    setStatus("Settings changed during generation; generate again after this pass");
  }
}

function applyRecommendedGrid(source: HTMLImageElement | HTMLCanvasElement): void {
  const recommendation = recommendGridForImage(
    source.width,
    source.height,
    state.settings.cellWidth,
    state.settings.cellHeight,
  );
  state.settings.columns = recommendation.columns;
  state.settings.rows = recommendation.rows;
  state.settings.sourcePixelsPerGlyph = recommendation.sourcePixelsPerGlyph;
  getElement<HTMLInputElement>("columns").value = String(state.settings.columns);
  setOutput("columns-output", state.settings.columns);
  getElement<HTMLInputElement>("rows").value = String(state.settings.rows);
  setOutput("rows-output", state.settings.rows);
  getElement<HTMLInputElement>("source-pixels").value = String(state.settings.sourcePixelsPerGlyph);
  setOutput("source-pixels-output", state.settings.sourcePixelsPerGlyph);
}

function updateStats(): void {
  const glyphCount = activeGlyphs().length;
  const fontWeightCount = state.fonts
    .filter((font) => font.selected)
    .reduce((sum, font) => sum + font.weights.length, 0);
  candidateCount.textContent = `Candidates: ${(glyphCount * fontWeightCount).toLocaleString()} planned${
    state.mosaic ? ` / ${state.mosaic.candidateCount.toLocaleString()} renderable` : ""
  }`;
  cellCount.textContent = `Cells: ${state.mosaic ? (state.mosaic.columns * state.mosaic.rows).toLocaleString() : "0"}`;
  sourceName.textContent = `Source: ${state.sourceName ?? "none"}`;
}

function renderProgress(progress: GenerateProgress): void {
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  setStatus(`${progress.message} (${percent}%)`);
}

function setStatus(message: string): void {
  status.textContent = message;
}

function setOutput(id: string, value: number): void {
  getElement<HTMLSpanElement>(id).textContent = String(value);
}

function numberSetting(key: keyof RenderSettings): (event: Event) => void {
  return (event: Event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      setNumericSetting(key, value);
    }
  };
}

function cellMetricSetting(key: "cellWidth" | "cellHeight"): (event: Event) => void {
  return (event: Event) => {
    const input = event.target as HTMLInputElement;
    const value = clampCellMetric(key, Number(input.value));
    if (!Number.isFinite(value)) {
      return;
    }

    input.value = String(value);
    setNumericSetting(key, value);
    if (state.settings.gridMode === "source-pixels" || key === "cellHeight") {
      markNeedsRegenerate();
      return;
    }

    applyVisualSettingsToMosaic();
  };
}

function clampCellMetric(key: "cellWidth" | "cellHeight", value: number): number {
  const bounds = key === "cellWidth" ? { minimum: 6, maximum: 28 } : { minimum: 8, maximum: 36 };
  return Math.max(bounds.minimum, Math.min(bounds.maximum, value));
}

function fontSizeSetting(): (event: Event) => void {
  return (event: Event) => {
    const input = event.target as HTMLInputElement;
    const value = clampFontSize(Number(input.value));
    if (Number.isFinite(value)) {
      input.value = String(value);
      setNumericSetting("fontSize", value);
      markNeedsRegenerate();
    }
  };
}

function clampFontSize(value: number): number {
  return Math.max(7, Math.min(34, value));
}

function cloneFonts(fonts: FontChoice[]): FontChoice[] {
  return fonts.map((font) => ({
    ...font,
    weights: [...font.weights],
  }));
}

function setNumericSetting(key: keyof RenderSettings, value: number): void {
  switch (key) {
    case "columns":
    case "rows":
    case "sourcePixelsPerGlyph":
    case "cellWidth":
    case "cellHeight":
    case "fontSize":
    case "outputScale":
    case "densityWindow":
      state.settings[key] = value;
      break;
    default:
      throw new Error(`${String(key)} is not a numeric setting`);
  }
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}
