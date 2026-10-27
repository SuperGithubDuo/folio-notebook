import { test, expect } from "@playwright/test";
test("tutor captures the original page before font readiness even after navigation", async ({
  page,
}) => {
  await page.goto("/");
  let sent;
  await page.route("**/api/tutor", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test transport: no credentials" }),
    });
  });
  await page.evaluate(() => {
    window.originalInk = document.querySelector(
      '[data-layer="student"]',
    ).innerHTML;
    Object.defineProperty(document.fonts, "ready", {
      configurable: true,
      value: new Promise((resolve) => (window.releaseFonts = resolve)),
    });
  });
  await page
    .getByLabel("Question for tutor")
    .fill("Check this handwritten page");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.locator(".page-thumb").nth(1).click();
  await page.evaluate(() => window.releaseFonts());
  await expect.poll(() => Boolean(sent)).toBeTruthy();
  const pixels = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(55, 65, 500, 700).data;
    let blue = 0;
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i + 2] > rgba[i] + 35 && rgba[i + 2] > rgba[i + 1] + 15) blue++;
    return blue;
  }, sent.image);
  expect(pixels).toBeGreaterThan(500);
});
