import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1600, height: 1100 } });
test("storage quota errors are visible and do not discard the in-memory notebook", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "folio.library.v1")
        throw new DOMException("Quota full", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
  await page.goto("/");
  await expect(page.locator(".save-status")).toContainText("export a backup");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Unsaved but editable");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(page.locator(".notebook-title")).toContainText(
    "Unsaved but editable",
  );
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.locator(".page-thumb")).toHaveCount(2);
  await expect(page.locator(".save-status")).toContainText("export a backup");
});
test("duplicating, drag reordering and last-page protection preserve ink", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Page review");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("at least one page");
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  const b = await page.locator(".notebook-svg").boundingBox();
  await page.mouse.move(b.x + 70, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 170, b.y + 130);
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Duplicate page", exact: true })
    .click();
  await expect(page.locator(".page-thumb")).toHaveCount(2);
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(1);
  await page.getByLabel("Paper style").selectOption("lined");
  await page
    .locator(".page-thumb")
    .nth(1)
    .dragTo(page.locator(".page-thumb").first());
  await expect(page.locator(".page-thumb").first()).toHaveClass(/current/);
  await page.reload();
  await expect(page.getByLabel("Paper style")).toHaveValue("lined");
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(1);
});
