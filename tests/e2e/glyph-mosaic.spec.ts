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
    }
    if (format === "TXT") {
      const text = await readFile(path!, "utf8");
      expect(text.trim().split("\n").length).toBeGreaterThan(0);
      expect(
        Array.from(text, (glyph) => glyph.codePointAt(0) ?? 0).every((code) => code <= 0x7f),
      ).toBe(true);
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
