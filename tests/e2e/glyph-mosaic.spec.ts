import { expect, test, type Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";

test("generates a mosaic from an uploaded image and exports all formats", async ({ page }) => {
  await page.goto("/");
  await page.locator("#image-input").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgklEQVR4nO3ZwQnAIBAFwYz779l2UBG8BKUIgeA2EJh99p5hMElvG8/rCwD8kUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQOB1rfu+p6PrnYvLWlQdVx9bMwcC5JOTmXMhICAAAAAAAAAAAAB4Gg+KOQdKPkSrjAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });

  await expect(page.locator("#source-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit source" })).toBeDisabled();
  await expect(page.locator("#status")).toContainText("Confirm source edits");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.locator("#candidate-count")).toContainText("renderable");
  await expect(page.locator("#cell-count")).not.toContainText("Cells: 0");
  await page.locator("#background").fill("#123456");

  const box = await page.locator("#preview-canvas").boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(200);

  for (const format of ["TXT", "SVG", "PNG", "JPEG", "PDF"]) {
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: format }).click(),
    ]).then(([download]) => download);
    const path = await download.path();
    expect(path).toBeTruthy();
    expect((await stat(path!)).size).toBeGreaterThan(0);
    expect(download.suggestedFilename().toLowerCase()).toContain(
      format === "JPEG" ? "fixture.jpg" : `fixture.${format.toLowerCase()}`,
    );
    if (format === "SVG") {
      const svg = await readFile(path!, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("#123456");
      expect(svg.match(/<text /g)?.length ?? 0).toBeGreaterThan(0);
      expect(svg).toContain("font-family=");
      expect(svg).toContain("font-weight=");
    }
    if (format === "TXT") {
      const text = await readFile(path!, "utf8");
      expect(text.trim().split("\n").length).toBeGreaterThan(0);
      expect(
        Array.from(text, (glyph) => glyph.codePointAt(0) ?? 0).every((code) => code <= 0x7f),
      ).toBe(true);
    }
    if (format === "PNG") {
      const dimensions = pngDimensions(await readFile(path!));
      expect(dimensions.width).toBeGreaterThan(300);
      expect(dimensions.height).toBeGreaterThan(200);
    }
    if (format === "JPEG") {
      const dimensions = jpegDimensions(await readFile(path!));
      expect(dimensions.width).toBeGreaterThan(300);
      expect(dimensions.height).toBeGreaterThan(200);
    }
    if (format === "PDF") {
      const pdf = await readFile(path!, "utf8");
      expect(pdf.startsWith("%PDF-")).toBe(true);
      expect(pdf).toContain("/Type /Page");
    }
  }
});

test("edits uploaded sources before generation and can reopen edit parameters", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#image-input").setInputFiles({
    name: "editable.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgklEQVR4nO3ZwQnAIBAFwYz779l2UBG8BKUIgeA2EJh99p5hMElvG8/rCwD8kUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQOB1rfu+p6PrnYvLWlQdVx9bMwcC5JOTmXMhICAAAAAAAAAAAAB4Gg+KOQdKPkSrjAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });

  await expect(page.locator("#source-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit source" })).toBeDisabled();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await page.getByLabel("Expand crop").check();
  await dragEditorCanvas(page, 0.16, 0.18, 0.72, 0.74);
  await dragEditorCanvas(page, 0.78, 0.78, 0.24, 0.28);

  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await dragEditorCanvas(page, 0.78, 0.52, 0.52, 0.2);
  await expect(page.locator("#source-editor-angle")).not.toHaveText("0 deg");

  await page.getByRole("button", { name: "CW 90", exact: true }).click();
  await page.getByRole("button", { name: "Flip H", exact: true }).click();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByLabel("Expand crop")).not.toBeChecked();
  await page.getByRole("button", { name: "Reset rotate" }).click();
  await page.getByRole("button", { name: "Reset flip" }).click();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByLabel("Expand crop")).toBeChecked();
  await expect(page.locator("#source-editor-angle")).toHaveText("0 deg");

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Edit source" })).toBeEnabled();

  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(page.locator("#source-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit source" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset flip" }).click();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByLabel("Expand crop")).toBeChecked();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#source-editor")).toBeHidden();

  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(page.locator("#source-editor")).toBeVisible();
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#source-editor")).toBeHidden();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
});

test("ignores stale uploads when another source is loaded first", async ({ page }) => {
  await delayFirstBlobImageLoad(page);

  await page.goto("/");
  await page.locator("#image-input").setInputFiles({
    name: "slow-upload.png",
    mimeType: "image/png",
    buffer: fixturePngBuffer(),
  });
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await page.waitForTimeout(700);

  await expect(page.locator("#source-editor")).toBeHidden();
  await expect(page.locator("#source-name")).toContainText("sample-gradient");
  await expect(page.getByRole("button", { name: "Edit source" })).toBeEnabled();
});

test("blocks replacement uploads while source edits are open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(page.locator("#source-editor")).toBeVisible();
  await page.locator("#image-input").setInputFiles({
    name: "blocked-replacement.png",
    mimeType: "image/png",
    buffer: fixturePngBuffer(),
  });
  await expect(page.locator("#status")).toContainText(
    "Confirm or cancel source edits before uploading another image",
  );
  await expect(page.locator("#source-editor")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#source-editor")).toBeHidden();
  await expect(page.locator("#source-name")).toContainText("sample-gradient");
  await expect(page.getByRole("button", { name: "Edit source" })).toBeEnabled();
});

test("can upload the same file again after cancelling source edits", async ({ page }) => {
  await page.goto("/");
  const upload = {
    name: "repeat-upload.png",
    mimeType: "image/png",
    buffer: fixturePngBuffer(),
  };

  await page.locator("#image-input").setInputFiles(upload);
  await expect(page.locator("#source-editor")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#source-editor")).toBeHidden();

  await page.locator("#image-input").setInputFiles(upload);
  await expect(page.locator("#source-editor")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Confirm source edits");
});

test("preserves grid settings when confirming unchanged source edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  await page.locator("#columns").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "77";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#columns-output")).toHaveText("77");

  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(page.locator("#source-editor")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.locator("#columns-output")).toHaveText("77");
});

test("keeps in-flight generation valid when source edits are cancelled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  await page.locator("#columns").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "180";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#rows").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "180";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#columns-output")).toHaveText("180");
  await expect(page.locator("#rows-output")).toHaveText("180");

  await page.getByRole("button", { name: "Generate mosaic" }).click();
  await expect(page.locator("#status")).toContainText(/Generated|Sampling|Rendering|Building/, {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(page.locator("#source-editor")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Generate mosaic" })).toBeDisabled();

  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Generate mosaic" })).toBeEnabled();
  await expect(page.locator("#cell-count")).toContainText("32,400");
});

test("contains the desktop preview by default and supports preview zoom controls", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop project only");

  await page.goto("/");
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  const frame = await page.locator(".preview-frame").boundingBox();
  const canvas = await page.locator("#preview-canvas").boundingBox();
  expect(frame).not.toBeNull();
  expect(canvas).not.toBeNull();
  expect(canvas!.width).toBeLessThanOrEqual(frame!.width + 1);
  expect(canvas!.height).toBeLessThanOrEqual(frame!.height + 1);
  await expect(page.locator(".preview-frame")).toHaveCSS("background-color", "rgb(251, 252, 251)");
  await expect(page.locator("#preview-canvas")).toHaveCSS("border-top-width", "1px");

  const controls = await page.locator(".controls").boundingBox();
  const workspace = await page.locator(".workspace").boundingBox();
  expect(controls).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(Math.abs(controls!.height - workspace!.height)).toBeLessThanOrEqual(1);

  const containedWidth = canvas!.width;
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => (await page.locator("#preview-canvas").boundingBox())?.width ?? 0)
    .toBeGreaterThan(containedWidth);

  await page.getByRole("button", { name: "Fit preview" }).click();
  await expect
    .poll(async () => (await page.locator("#preview-canvas").boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(frame!.width + 1);

  const fitWidth = (await page.locator("#preview-canvas").boundingBox())!.width;
  await page.locator(".preview-frame").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -600,
  });
  await expect
    .poll(async () => (await page.locator("#preview-canvas").boundingBox())?.width ?? 0)
    .toBeGreaterThan(fitWidth);

  const wheelZoomWidth = (await page.locator("#preview-canvas").boundingBox())!.width;
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect
    .poll(async () => (await page.locator("#preview-canvas").boundingBox())?.width ?? 0)
    .toBeLessThan(wheelZoomWidth);
});

test("supports explicit non-ASCII glyph packs and source-pixel grid mode", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("User glyphs").fill("漢字🙂");
  await page.getByLabel("Grid mode").selectOption("source-pixels");
  await page.getByLabel("CJK").check();
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  const initialCellCount = await statNumber(page, "#cell-count");
  const plannedCandidateCount = await statNumber(page, "#candidate-count");
  expect(plannedCandidateCount).toBeGreaterThan(500);

  await page.locator("#source-pixels").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "18";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Generate mosaic" }).click();

  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.locator("#candidate-count")).toContainText("renderable");
  const sourcePixelCellCount = await statNumber(page, "#cell-count");
  expect(sourcePixelCellCount).toBeLessThan(initialCellCount);

  await page.getByLabel("Cell width").fill("20");
  await expect(page.locator("#status")).toContainText("Settings changed");
  await page.getByRole("button", { name: "Generate mosaic" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  expect(await statNumber(page, "#cell-count")).not.toBe(sourcePixelCellCount);

  await page.getByLabel("Cell width").fill("100000");
  await expect(page.getByLabel("Cell width")).toHaveValue("28");
  await page.getByLabel("Font size").fill("-1");
  await expect(page.getByLabel("Font size")).toHaveValue("7");
});

test("uses explicitly provided non-ASCII glyphs when ASCII is disabled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("User glyphs")).toHaveAttribute(
    "placeholder",
    /uncheck ASCII to use only this field/,
  );
  await expect(page.getByText("User glyphs are added to checked packs")).toBeVisible();
  await page.getByLabel("ASCII").uncheck();
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Add at least one glyph");

  await page.getByLabel("User glyphs").fill("Ω");
  await page.getByRole("button", { name: "Generate mosaic" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  const txtDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "TXT" }).click(),
  ]).then(([download]) => download);
  const txtPath = await txtDownload.path();
  expect(await readFile(txtPath!, "utf8")).toContain("Ω");

  const svgDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG" }).click(),
  ]).then(([download]) => download);
  const svgPath = await svgDownload.path();
  const svg = await readFile(svgPath!, "utf8");
  expect(svg).toContain(">Ω</text>");
  expect(svg).toContain("font-family=");
  expect(svg).toContain("font-weight=");
});

test("filters fonts with fuzzy and exact search and labels font weights", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Font weights")).toBeVisible();
  await expect(page.getByText("400 Regular")).toBeVisible();
  await expect(page.getByText("700 Bold")).toBeVisible();
  await expect(page.locator("#font-scan-hint")).toContainText("Local Font Access");

  await page.getByLabel("Search fonts").fill("msp");
  await expect(page.getByText("Monospace")).toBeVisible();
  await expect(page.locator("#font-scan-hint")).toContainText(
    "2 selected fonts are hidden by search and still included in generation.",
  );

  await page.getByLabel("Exact text match").check();
  await expect(page.getByText("No fonts match this search.")).toBeVisible();
  await expect(page.locator("#font-scan-hint")).toContainText(
    "3 selected fonts are hidden by search and still included in generation.",
  );

  await page.getByLabel("Search fonts").fill("mono");
  await expect(page.getByText("Monospace")).toBeVisible();
});

test("reports invalid image and font uploads", async ({ page }) => {
  await page.goto("/");
  await page.locator("#image-input").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator("#status")).toContainText("could not be decoded");

  await page.locator("#font-input").setInputFiles({
    name: "bad.ttf",
    mimeType: "font/ttf",
    buffer: Buffer.from("not a font"),
  });
  await expect(page.locator("#status")).toContainText("No uploaded fonts could be registered");
});

test("keeps the mobile layout usable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Glyph Mosaic Creator" })).toBeVisible();
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  const controls = await page.locator(".controls").boundingBox();
  const workspace = await page.locator(".workspace").boundingBox();
  expect(controls).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(workspace!.y).toBeGreaterThan(controls!.y);
});

async function statNumber(page: Page, selector: string): Promise<number> {
  const text = await page.locator(selector).textContent();
  const match = text?.match(/\d[\d,]*/);
  return Number(match?.[0].replaceAll(",", "") ?? 0);
}

async function dragEditorCanvas(
  page: Page,
  startXRatio: number,
  startYRatio: number,
  endXRatio: number,
  endYRatio: number,
): Promise<void> {
  const canvas = page.locator("#source-editor-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width * startXRatio;
  const startY = box!.y + box!.height * startYRatio;
  const endX = box!.x + box!.width * endXRatio;
  const endY = box!.y + box!.height * endYRatio;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

async function delayFirstBlobImageLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (!descriptor?.get || !descriptor.set) {
      return;
    }

    const NativeImage = window.Image;
    let delayedBlobLoads = 0;
    window.Image = function patchedImage(width?: number, height?: number) {
      const image = new NativeImage(width, height);
      Object.defineProperty(image, "src", {
        configurable: true,
        get() {
          return descriptor.get!.call(image);
        },
        set(value: string) {
          const delay = value.startsWith("blob:") && delayedBlobLoads === 0 ? 350 : 0;
          delayedBlobLoads += value.startsWith("blob:") ? 1 : 0;
          window.setTimeout(() => descriptor.set!.call(image, value), delay);
        },
      });
      return image;
    } as typeof Image;
    window.Image.prototype = NativeImage.prototype;
  });
}

function fixturePngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgklEQVR4nO3ZwQnAIBAFwYz779l2UBG8BKUIgeA2EJh99p5hMElvG8/rCwD8kUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQOB1rfu+p6PrnYvLWlQdVx9bMwcC5JOTmXMhICAAAAAAAAAAAAB4Gg+KOQdKPkSrjAAAAABJRU5ErkJggg==",
    "base64",
  );
}

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer[0]).toBe(0xff);
  expect(buffer[1]).toBe(0xd8);

  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) {
      offset += 1;
    }
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const length = buffer.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  throw new Error("JPEG dimensions could not be read");
}
