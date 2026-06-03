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
  sourceName: string;
  mosaic: Mosaic | null;
  isGenerating: boolean;
  needsRegenerate: boolean;
  generationVersion: number;
  previewZoomMultiplier: number;
}

const state: AppState = {
  settings: { ...DEFAULT_SETTINGS },
  fonts: structuredClone(BUILTIN_FONTS),
  enabledPacks: new Set(GLYPH_PACKS.filter((pack) => pack.defaultEnabled).map((pack) => pack.id)),
  userGlyphs: "",
  fontSearch: "",
  fontExactMatch: false,
  source: null,
  sourceName: "sample",
  mosaic: null,
  isGenerating: false,
  needsRegenerate: false,
  generationVersion: 0,
  previewZoomMultiplier: DEFAULT_PREVIEW_ZOOM_MULTIPLIER,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing app root");
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
        <label class="file-drop">
          <input id="image-input" type="file" accept="image/*" />
          <span>Upload image</span>
        </label>
        <button id="sample-button" class="secondary" type="button">Load sample</button>
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }

    try {
      setStatus("Loading image");
      state.source = await loadImageFromFile(file);
      state.sourceName = file.name;
      applyRecommendedGrid(state.source);
      markNeedsRegenerate();
      await generate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Image loading failed");
    }
  });

  getElement<HTMLButtonElement>("sample-button").addEventListener("click", async () => {
    state.source = createSampleImage();
    state.sourceName = "sample-gradient";
    applyRecommendedGrid(state.source);
    markNeedsRegenerate();
    await generate();
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
  if (state.isGenerating) {
    setStatus("Generation is already running; changed settings will need a new pass");
    return;
  }

  if (!state.source) {
    state.source = createSampleImage();
    state.sourceName = "sample-gradient";
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
    getElement<HTMLButtonElement>("generate-button").disabled = false;
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
  const frameWidth = previewFrame.clientWidth;
  const frameHeight = previewFrame.clientHeight;
  if (frameWidth <= 0 || frameHeight <= 0) {
    return 1;
  }

  return Math.min(1, frameWidth / naturalSize.width, frameHeight / naturalSize.height);
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
