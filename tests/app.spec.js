import { test, expect } from "@playwright/test";
test("notebook creation, ink, erasing, history and reload persistence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Math Notes", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Integration notes");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  await expect(page.locator(".notebook-title")).toContainText(
    "Integration notes",
  );
  const svg = page.locator(".notebook-svg");
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 150, { steps: 15 });
  await page.mouse.up();
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(svg.locator("[data-element-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator(".notebook-title")).toContainText(
    "Integration notes",
  );
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + 110, b.y + 115);
  await page.mouse.down();
  await page.mouse.move(b.x + 130, b.y + 125);
  await page.mouse.up();
  await expect(svg.locator("[data-element-id]")).toHaveCount(0);
});
test("page management, paper, theme, tutor and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.locator(".page-thumb")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Duplicate page", exact: true })
    .click();
  await expect(page.locator(".page-thumb")).toHaveCount(5);
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.locator(".page-thumb")).toHaveCount(4);
  await page.getByLabel("Paper style").selectOption("dotted");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByPlaceholder("Ask about your notes…").fill("Check my work");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".ai-error")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".canvas-scroll")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
