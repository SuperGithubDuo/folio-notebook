import { test, expect } from "@playwright/test";
test("lasso and move use final pointerup coordinates even without pointermove", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Pointer liftoff");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const svg = page.locator(".notebook-svg");
  const b = await svg.boundingBox();
  async function event(type, x, y) {
    await svg.dispatchEvent(type, {
      pointerId: 9,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: b.x + x * 0.78,
      clientY: b.y + y * 0.78,
    });
  }
  await event("pointerdown", 80, 100);
  await event("pointerup", 220, 180);
  await page.getByRole("button", { name: "Lasso selection" }).click();
  await event("pointerdown", 60, 80);
  await event("pointerup", 240, 200);
  await expect(page.locator(".selection-actions")).toBeVisible();
  await event("pointerdown", 130, 140);
  await event("pointerup", 170, 180);
  expect(
    Number(await svg.locator("[data-element-id]").getAttribute("x")),
  ).toBeCloseTo(120, 6);
});
