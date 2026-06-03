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
