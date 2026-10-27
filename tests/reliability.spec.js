import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1600, height: 1100 } });
test("malformed saved library and blocked theme storage do not crash the notebook", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "folio.library.v1",
      JSON.stringify({ version: 1, notebooks: [{ id: "broken" }] }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "folio.theme")
        throw new DOMException("Blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.locator(".notebook-title")).toContainText("Math Notes");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("empty selection is not announced; AI failures preserve the question and do not add ink", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".context-pill")).not.toContainText(
    "selection active",
  );
  await page.route("**/api/tutor", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<h1>Gateway failed</h1>",
    }),
  );
  await page
    .getByLabel("Question for tutor")
    .fill("Can you check this handwritten equation?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".ai-error")).toContainText("unavailable");
  await expect(page.getByLabel("Question for tutor")).toHaveValue(
    "Can you check this handwritten equation?",
  );
  await expect(page.locator('[data-layer="ai"] [data-element-id]')).toHaveCount(
    0,
  );
});
test("drawn math is sent as an actual image in each mode; missing credentials stays explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Handwritten AI review");
  await page.getByRole("button", { name: "Create notebook" }).click();
  const box = await page.locator(".notebook-svg").boundingBox();
  const strokes = [
    [
      [90, 120],
      [125, 160],
    ],
    [
      [125, 120],
      [90, 160],
    ],
    [
      [145, 130],
      [175, 130],
    ],
    [
      [160, 115],
      [160, 145],
    ],
    [
      [190, 130],
      [220, 130],
    ],
    [
      [190, 145],
      [220, 145],
    ],
    [
      [245, 120],
      [275, 120],
      [245, 160],
      [275, 160],
    ],
  ];
  for (const points of strokes) {
    await page.mouse.move(
      box.x + points[0][0] * 0.78,
      box.y + points[0][1] * 0.78,
    );
    await page.mouse.down();
    for (const [x, y] of points.slice(1))
      await page.mouse.move(box.x + x * 0.78, box.y + y * 0.78, { steps: 4 });
    await page.mouse.up();
  }
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(
    strokes.length,
  );
  for (const mode of [
    "Guided Learning",
    "Hints",
    "Detailed Explanation",
    "Full Solution",
  ]) {
    await page.getByLabel("Learning mode").selectOption(mode);
    await page.getByLabel("Question for tutor").fill("Help me with x + 1 = 2");
    const request = page.waitForRequest((r) => r.url().endsWith("/api/tutor"));
    await page.getByRole("button", { name: "Send question" }).click();
    const body = (await request).postDataJSON();
    expect(body.mode).toBe(mode);
    expect(body.image).toMatch(/^data:image\/png;base64,/);
    expect(body.image.length).toBeGreaterThan(3000);
    await expect(page.locator(".ai-error")).toContainText("OPENAI_API_KEY");
  }
  await expect(page.locator(".message.assistant")).toHaveCount(0);
  await expect(page.locator('[data-layer="ai"] [data-element-id]')).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "dogfood-output/screenshots/handwritten-math-no-credentials.png",
  });
});
