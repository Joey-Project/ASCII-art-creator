import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";

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
  }
});

test("supports explicit non-ASCII glyph packs and source-pixel grid mode", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("User glyphs").fill("漢字🙂");
  await page.getByLabel("Grid mode").selectOption("source-pixels");
  await page.getByLabel("CJK").check();
  await page.getByRole("button", { name: "Load sample" }).click();
  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });

  await page.locator("#source-pixels").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "18";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Generate mosaic" }).click();

  await expect(page.locator("#status")).toContainText("Mosaic ready", { timeout: 30_000 });
  await expect(page.locator("#candidate-count")).toContainText("renderable");
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
