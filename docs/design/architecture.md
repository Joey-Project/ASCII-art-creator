# Glyph Mosaic Creator Architecture

## Summary

Glyph Mosaic Creator is a GitHub Pages friendly static SPA built with Vite + TypeScript + pnpm. It renders uploaded images into a fixed grid of typographic cells. Each cell independently chooses a `glyph + font + weight + color` candidate, so multi-font output is controlled by the app's cell model instead of depending on browser text layout.

The default candidate library is ASCII only. Non-ASCII glyphs, including CJK, kana, math symbols, emoji, and music symbols, enter the library only when the user provides them directly or explicitly enables a glyph pack.

## Product Flow

- Image input: users upload an image, which is decoded locally and then confirmed through a browser-local source editor before generation.
- Source editing: crop, rotate, and flip operations are stored as replayable edit operations against the original image. The confirmed result is cached as a canvas and becomes the source consumed by the generator.
- Grid setup: users choose row/column counts directly, or choose source pixels per glyph. The app recommends initial rows and columns from uploaded image dimensions, keeping aspect ratio and balancing detail against preview performance.
- Glyph setup: default ASCII candidates are always available. User text and explicit glyph packs can add multilingual or symbol candidates.
- Font setup: default web-safe font presets are available first, but only Monospace at `400 Regular` is selected by default. Additional fonts and weights are opt-in. Uploaded fonts are registered with `FontFace`. Local Font Access is a progressive enhancement for supported desktop browsers and must degrade cleanly when unavailable.
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

## Source Editing Model

Source editing is a pre-generation stage. It must keep the original decoded image, the replayable operation list, and the confirmed canvas cache separate:

- Uploading a new image opens the editor and does not update the generator source until the user confirms.
- `Load sample` keeps the fast path and generates immediately, while `Edit source` can reopen the same editor later.
- While the editor is open, generation and source-editor reopening are blocked so unconfirmed upload/edit state cannot be silently replaced by a previously confirmed source.
- Operations are committed as ordered stages and replay in user order. Crop coordinates are interpreted in the current replayed image space for the stage where the crop was created.
- Re-entering the same tool edits only the trailing same-kind stage. If another stage was added later, entering crop or rotate appends a new stage instead of mutating an older one.
- 90 degree rotations and flips use integer canvas transforms without smoothing.
- Free rotation uses Canvas high-quality smoothing. The rotated content is first rendered into its expanded bounding canvas; the output-frame crop caused by rotation is deferred to the end so a later expanded crop can include areas that would otherwise have been clipped.
- No-op confirmation preserves the original decoded image instead of allocating a full-size canvas. Once edit operations are present, the editor uses a capped work-canvas budget and limits expanded crop output to avoid browser canvas size and memory failures.
- Interactive crop/rotate previews cache the replay stage before the active operation and coalesce pointer-driven redraws with `requestAnimationFrame`. This keeps click-order replay semantics while avoiding full source replay on every pointermove.
- Reset all clears the operation list. Feature-specific resets remove crop, rotate, or flip operations while preserving the original image; reset of rotate/flip also drops later crop operations whose coordinates depended on the removed transform space.

The mosaic generator should continue to consume only an `HTMLImageElement`, `HTMLCanvasElement`, or `ImageBitmap`. It should not know whether the source came directly from upload, sample generation, or the editor's confirmed canvas cache.

## Candidate Library

Candidates are generated from `glyph x font x weight`. The library can grow quickly, for example 200 glyphs x 20 fonts x 5 weights = 20,000 candidates, so the app must avoid per-cell full scans for normal interactive use.

Rules:

- Segment user input with `Intl.Segmenter` when available, with a grapheme-safe fallback.
- Deduplicate candidates after segmentation.
- Render-test each candidate and exclude empty or unsupported glyphs for a font/weight pair.
- Preserve intrinsic rendered color for candidates whose browser/native glyph rendering is not purely recolorable, especially emoji. Detection uses the normal black glyph sample plus a high-saturation probe render when needed, so dark or desaturated native glyphs are not mistaken for recolorable black text.
- Cache measured features per candidate and invalidate only when glyphs, fonts, weights, or cell metrics change.
- Keep ASCII as the only default pack. Enable broader Unicode only by user input or explicit pack selection.

## Feature Matching

Both source cells and glyph candidates should use comparable features:

- Luminance or density for base brightness matching.
- Local block density for two-dimensional shape matching.
- Sobel-style edge direction to prefer line glyphs such as `/`, `\`, `|`, `-`, and `_` when they match local structure.
- Local contrast to keep outlines legible.
- Optional dithering, such as Floyd-Steinberg style error diffusion over density, to simulate additional gray levels.

For color output, glyph selection should still express lightness and texture, while foreground color can come from source image sampling or user-selected grouping rules. When the user chooses grouped color strategies (`glyph`, `font`, or `glyph + font + weight`), the matcher adds a bounded RGB-distance penalty between the source cell's average color and the candidate's grouped foreground color. This lets strong color changes steer the cell toward a different candidate without disabling the density bucket prefilter or replacing the shape score. Intrinsic colored glyphs use their sampled native color as the candidate color signal; strong native color, such as color emoji, overrides app-assigned grouping color for scoring because browser rendering may ignore `fillStyle`.

## Performance Strategy

Feature extraction and matching should run in Web Workers once the library or grid becomes large. The initial matching path should use a staged search:

- Bucket candidates by brightness/density and only compare nearby buckets.
- Within buckets, rank by weighted feature distance, optionally plus grouped-color or intrinsic-glyph color distance.
- Add KD-tree or approximate nearest-neighbor indexing when candidate count makes bucket search too slow.
- Use progressive rendering so the preview can update quickly before the full-resolution export grid completes.

The UI should expose quality controls without forcing maximum-cost matching by default.

## Color Modes

Supported color strategies:

- Monochrome: convert source to luminance and render all glyphs with a chosen foreground color.
- Source color: choose glyphs by luminance/texture and use each cell's sampled source color.
- By glyph: assign colors by glyph identity; candidate selection also prefers glyph colors closer to the source cell average color.
- By font: assign colors by font family; candidate selection also prefers font colors closer to the source cell average color.
- By glyph-font combination: assign colors by the full `glyph + font + weight` candidate; candidate selection also prefers grouped colors closer to the source cell average color.

Source and uniform color strategies remain feature-only for normally recolorable glyphs because all candidates can receive the same app-assigned foreground color. Candidates with intrinsic native color are the exception: their sampled color is compared with the source cell average so mismatched emoji are penalized and matching emoji can stay competitive. Mono mode remains feature-only; intrinsic color is detected but does not alter grayscale matching.

Because intrinsic color can affect source and uniform candidate selection only in color mode, switching between mono and color source/uniform marks the existing mosaic stale and requires regeneration before export. Switching between source and uniform inside color mode is visual-only because the intrinsic-color selection policy is unchanged.

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
