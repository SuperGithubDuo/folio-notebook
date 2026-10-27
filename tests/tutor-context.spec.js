import { test, expect } from "@playwright/test";
test("pending tutor request keeps another page editable and the source request context", async ({
  page,
}) => {
  await page.goto("/");
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/tutor", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Review: provider unavailable" }),
    });
  });
  await page.getByLabel("Question for tutor").fill("Original page question");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".thinking")).toBeVisible();
  await page.locator(".page-thumb").nth(1).click();
  await expect(page.locator(".message.user")).toHaveCount(0);
  release();
  await expect(page.locator(".thinking")).toHaveCount(0);
  await expect(page.locator(".ai-error")).toHaveCount(0);
  await page.locator(".page-thumb").first().click();
  await expect(page.locator(".ai-error")).toContainText("provider unavailable");
});
