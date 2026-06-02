# Glyph Mosaic Creator Architecture

## Summary

Glyph Mosaic Creator is a GitHub Pages friendly static SPA built with Vite + TypeScript + pnpm. It renders uploaded images into a fixed grid of typographic cells. Each cell independently chooses a `glyph + font + weight + color` candidate, so multi-font output is controlled by the app's cell model instead of depending on browser text layout.

The default candidate library is ASCII only. Non-ASCII glyphs, including CJK, kana, math symbols, emoji, and music symbols, enter the library only when the user provides them directly or explicitly enables a glyph pack.

## Product Flow

- Image input: users upload an image, which is decoded locally into canvas/image data.
- Grid setup: users choose row/column counts directly, or choose source pixels per glyph. The app recommends initial rows and columns from uploaded image dimensions, keeping aspect ratio and balancing detail against preview performance.
- Glyph setup: default ASCII candidates are always available. User text and explicit glyph packs can add multilingual or symbol candidates.
- Font setup: default web-safe font presets are available first. Uploaded fonts are registered with `FontFace`. Local Font Access is a progressive enhancement for supported desktop browsers and must degrade cleanly when unavailable.
- Preview and export: the canvas preview is the visual source of truth; text/SVG/PDF exports derive from the same cell grid.

## Rendering Model

The renderer treats the output as a matrix of cells. A cell stores:

- `glyph`: a grapheme cluster, not a single UTF-16 code unit.
- `fontFamily`: the selected font face.
- `fontWeight`: the selected weight.
- `foreground`: the rendered text color.
- `background`: optional cell background.
- `sourceColor`: sampled source color for color modes.

Cell-level mixing is required. The renderer may use canvas text APIs to draw each cell, but it must not hand a long mixed-font string to the browser and rely on normal text shaping to decide the mosaic.

## Candidate Library

Candidates are generated from `glyph x font x weight`. The library can grow quickly, for example 200 glyphs x 20 fonts x 5 weights = 20,000 candidates, so the app must avoid per-cell full scans for normal interactive use.

Rules:

- Segment user input with `Intl.Segmenter` when available, with a grapheme-safe fallback.
- Deduplicate candidates after segmentation.
- Render-test each candidate and exclude empty or unsupported glyphs for a font/weight pair.
- Cache measured features per candidate and invalidate only when glyphs, fonts, weights, or cell metrics change.
- Keep ASCII as the only default pack. Enable broader Unicode only by user input or explicit pack selection.

## Feature Matching

Both source cells and glyph candidates should use comparable features:

- Luminance or density for base brightness matching.
- Local block density for two-dimensional shape matching.
- Sobel-style edge direction to prefer line glyphs such as `/`, `\`, `|`, `-`, and `_` when they match local structure.
- Local contrast to keep outlines legible.
- Optional dithering, such as Floyd-Steinberg style error diffusion over density, to simulate additional gray levels.

For color output, glyph selection should still express lightness and texture, while foreground color can come from source image sampling or user-selected grouping rules.

## Performance Strategy

Feature extraction and matching should run in Web Workers once the library or grid becomes large. The initial matching path should use a staged search:

- Bucket candidates by brightness/density and only compare nearby buckets.
- Within buckets, rank by weighted feature distance.
- Add KD-tree or approximate nearest-neighbor indexing when candidate count makes bucket search too slow.
- Use progressive rendering so the preview can update quickly before the full-resolution export grid completes.

The UI should expose quality controls without forcing maximum-cost matching by default.

## Color Modes

Supported color strategies:

- Monochrome: convert source to luminance and render all glyphs with a chosen foreground color.
- Source color: choose glyphs by luminance/texture and use each cell's sampled source color.
- By glyph: assign colors by glyph identity.
- By font: assign colors by font family.
- By glyph-font combination: assign colors by the full `glyph + font + weight` candidate.

Background color is configurable. Transparent background is allowed for PNG/SVG when the selected export path supports it.

## Export Model

- `.txt`: export the glyph grid without color or font metadata.
- `.png` and `.jpeg`: render from the cell grid to an offscreen canvas at the selected resolution multiplier.
- `.svg`: prefer cell-positioned text elements when fonts and glyphs can be represented; provide a raster fallback when visual fidelity would otherwise break.
- `.pdf`: prioritize visual fidelity, likely by embedding a high-resolution raster render for V1.

All exports must use the same cell grid as preview so changing rows, columns, pixel step, fonts, or glyph packs has predictable results.

## Testing And CI

CI should run through pnpm and include formatter, linter, TypeScript, unit tests, Playwright e2e, and production build checks. GitHub Pages deployment should publish the static `dist/` output.

Playwright e2e coverage should include:

- Desktop and mobile viewports without overlapping controls or preview.
- Uploading a fixture image and generating a non-empty preview.
- Switching monochrome/color modes and verifying the preview updates.
- Changing row/column counts and pixels-per-glyph settings.
- Confirming non-ASCII glyphs are absent by default and present only after user input or explicit pack enablement.
- Local Font Access unavailable path degrades to default/uploaded fonts.
- PNG, JPEG, SVG, PDF, and TXT exports produce non-empty downloads.
