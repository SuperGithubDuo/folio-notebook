import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
test("imports a real PDF and exports all notebook pages", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const pdf = new jsPDF();
  pdf.text("PDF annotation test", 20, 30);
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "fixture.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
  await expect(page.locator(".page-thumb")).toHaveCount(4, { timeout: 15000 });
  await expect(page.locator(".notebook-svg image")).toHaveCount(1);
  const dlPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notebook as PDF" }).click();
  const download = await dlPromise;
  expect(download.suggestedFilename()).toBe("Math Notes.pdf");
  const path = await download.path();
  const fs = await import("node:fs/promises");
  const output = await fs.readFile(path);
  expect(output.subarray(0, 5).toString()).toBe("%PDF-");
  expect(output.length).toBeGreaterThan(10000);
});
test("lasso selects and moves drawn ink; shapes and text are editable objects", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Selection test");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const svg = page.locator(".notebook-svg");
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + 60, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 130, { steps: 4 });
  await page.mouse.up();
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Lasso selection" }).click();
  await page.mouse.move(b.x + 45, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 160, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".selection-actions")).toBeVisible();
  const before = await svg.locator("[data-element-id]").getAttribute("x");
  await page.mouse.move(b.x + 100, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 140, { steps: 4 });
  await page.mouse.up();
  const after = await svg.locator("[data-element-id]").getAttribute("x");
  expect(Number(after)).toBeGreaterThan(Number(before));
  await page.getByRole("button", { name: "Text box" }).click();
  await page.mouse.click(b.x + 70, b.y + 220);
  const editor = page.locator(".notebook-canvas textarea");
  await expect(editor).toBeVisible();
  await editor.fill("My own equation");
  await editor.press("Control+Enter");
  await expect(svg.locator("text")).toContainText("My own equation");
});
