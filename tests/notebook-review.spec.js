import { test, expect } from "@playwright/test";

// Every test gets Playwright's isolated browser context. No user profile or API mocks.
test.use({ viewport: { width: 1600, height: 1100 } });
const ink = (page) => page.locator(".notebook-svg [data-element-id]");
async function fresh(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Canvas review");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  await expect(ink(page)).toHaveCount(0);
}
async function drag(page, from, to, steps = 8) {
  const b = await page.locator(".notebook-svg").boundingBox();
  const at = ([x, y]) => [
    b.x + (x * b.width) / 800,
    b.y + (y * b.height) / 1100,
  ];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps });
  await page.mouse.up();
}
async function penEvents(page, events) {
  const svg = page.locator(".notebook-svg");
  const b = await svg.boundingBox();
  for (const [type, x, y, pressure] of events) {
    await svg.dispatchEvent(type, {
      pointerId: 71,
      pointerType: "pen",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pressure,
      clientX: b.x + (x * b.width) / 800,
      clientY: b.y + (y * b.height) / 1100,
    });
  }
}

test("synthetic stylus preserves zero pressure and final lift coordinates", async ({
  page,
}) => {
  await fresh(page);
  await penEvents(page, [
    ["pointerdown", 80, 80, 0],
    ["pointermove", 140, 80, 1],
    ["pointerup", 200, 80, 0],
  ]);
  await expect(ink(page)).toHaveCount(1);
  // Geometry is read from the rendered outline, not fabricated application state.
  const bounds = await ink(page).evaluate((el) => {
    const b = el.getBBox();
    return { x: b.x, width: b.width };
  });
  expect(bounds.x + bounds.width).toBeCloseTo(200, 1);
});

test("synthetic stylus zero pressure is not replaced by medium pressure", async ({
  page,
}) => {
  await fresh(page);
  await penEvents(page, [
    ["pointerdown", 80, 80, 0],
    ["pointermove", 140, 80, 1],
    ["pointerup", 140, 80, 0],
  ]);
  const path = await ink(page).getAttribute("d");
  const firstY = Number(path.split(" ")[2]);
  expect(firstY - 80).toBeCloseTo((2.5 * 0.25) / 2, 3);
});

test("pen pencil highlighter custom colors thickness and swept erasing use real UI", async ({
  page,
}) => {
  await fresh(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tools = [
    ["Pen", "#285799", "1"],
    ["Pencil", "#ce7181", "0.72"],
    ["Highlighter", "#8057ba", "0.28"],
  ];
  for (let i = 0; i < tools.length; i++) {
    const [name, color, opacity] = tools[i];
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", { name: `Ink ${color}`, exact: true })
      .click();
    await page.getByLabel("Pen thickness").fill(String(2 + i * 3));
    await drag(page, [80, 100 + i * 70], [240, 115 + i * 70]);
    await expect(ink(page).nth(i)).toHaveAttribute("fill", color);
    await expect(ink(page).nth(i)).toHaveAttribute("opacity", opacity);
  }
  const heights = await ink(page).evaluateAll((els) =>
    els.map((el) => el.getBBox().height),
  );
  expect(heights[2]).toBeGreaterThan(heights[0] + 20);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByLabel("Custom ink color").fill("#123abc");
  await drag(page, [80, 320], [240, 320]);
  await expect(ink(page).last()).toHaveAttribute("fill", "#123abc");
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await drag(page, [150, 60], [150, 350], 1);
  await expect(ink(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(ink(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("lasso moves resizes deletes and keyboard history restores editable geometry", async ({
  page,
}) => {
  await fresh(page);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drag(page, [80, 100], [220, 180]);
  await page.keyboard.press("l");
  await drag(page, [60, 80], [240, 200]);
  await expect(page.locator(".selection-actions")).toBeVisible();
  await drag(page, [130, 140], [170, 180]);
  expect(Number(await ink(page).getAttribute("x"))).toBeCloseTo(120, 2);
  const handle = await page.locator("[data-selection-handle]").boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + 60, { steps: 4 });
  await page.mouse.up();
  expect(Number(await ink(page).getAttribute("width"))).toBeGreaterThan(200);
  await page.keyboard.press("Delete");
  await expect(ink(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(ink(page)).toHaveCount(1);
  await page.keyboard.press("Control+y");
  await expect(ink(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect(Number(await ink(page).getAttribute("width"))).toBeCloseTo(140, 2);
});

test("page specific history survives navigation and content paper order persist on reload", async ({
  page,
}) => {
  await fresh(page);
  await drag(page, [80, 100], [200, 120]);
  const firstId = await ink(page).getAttribute("data-element-id");
  await page.getByLabel("Paper style").selectOption("dotted");
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await drag(page, [100, 200], [260, 240]);
  const secondId = await ink(page).getAttribute("data-element-id");
  await page.getByLabel("Paper style").selectOption("lined");
  await page.locator(".page-thumb").first().click();
  await page.keyboard.press("Control+z");
  await expect(ink(page)).toHaveCount(0);
  await page.locator(".page-thumb").nth(1).click();
  await expect(ink(page)).toHaveAttribute("data-element-id", secondId);
  await page.keyboard.press("Control+z");
  await expect(ink(page)).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await page.locator(".page-thumb").first().click();
  await page.keyboard.press("Control+y");
  await expect(ink(page)).toHaveAttribute("data-element-id", firstId);
  await page
    .getByRole("button", { name: "Move page down", exact: true })
    .click();
  await expect(page.locator(".page-thumb").nth(1)).toHaveClass(/current/);
  await expect(page.locator(".save-status")).toContainText("Saved");
  await page.reload();
  await expect(ink(page)).toHaveAttribute("data-element-id", firstId);
  await expect(page.getByLabel("Paper style")).toHaveValue("dotted");
  await page.locator(".page-thumb").first().click();
  await expect(ink(page)).toHaveAttribute("data-element-id", secondId);
  await expect(page.getByLabel("Paper style")).toHaveValue("lined");
});

test("focus panels paper themes zoom and hand pan do not modify ink", async ({
  page,
}) => {
  await fresh(page);
  await drag(page, [80, 100], [200, 120]);
  const before = await ink(page).getAttribute("d");
  for (const paper of ["grid", "lined", "dotted", "blank"]) {
    await page.getByLabel("Paper style").selectOption(paper);
    await expect(page.locator(".notebook-svg [data-paper]")).toHaveAttribute(
      "data-paper",
      paper,
    );
  }
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTitle("Focus mode", { exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(
    /hide-library.*hide-pages.*hide-ai/,
  );
  await page.getByRole("button", { name: "Open library" }).click();
  await page.getByRole("button", { name: "Toggle page panel" }).click();
  await page.getByRole("button", { name: "AI Tutor", exact: true }).click();
  await expect(page.locator(".app")).not.toHaveClass(
    /hide-library|hide-pages|hide-ai/,
  );
  const width = (await page.locator(".notebook-svg").boundingBox()).width;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(
    (await page.locator(".notebook-svg").boundingBox()).width,
  ).toBeGreaterThan(width);
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "78%",
  );
  await page.keyboard.press("h");
  await drag(page, [300, 400], [200, 180]);
  expect(
    await page.locator(".canvas-scroll").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0);
  await expect(ink(page)).toHaveAttribute("d", before);
  await page.screenshot({
    path: "dogfood-output/screenshots/notebook-review-dark.png",
  });
});

test("folders favorites search trash restore and unavailable AI are honest UI flows", async ({
  page,
}) => {
  await fresh(page);
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await page.getByLabel("Folder name").fill("Review folder");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Notebook options", exact: true })
    .click();
  await page.getByLabel("Move to folder").selectOption("Review folder");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Review folder", exact: true })
    .click();
  await expect(page.locator(".notebook-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Toggle favorite" }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(
    page.locator(".notebook-item").filter({ hasText: "Canvas review" }),
  ).toHaveCount(1);
  await page.getByLabel("Search notebooks").fill("nonexistent");
  await expect(page.locator(".notebook-item")).toHaveCount(0);
  await page.getByLabel("Search notebooks").fill("Canvas review");
  await expect(page.locator(".notebook-item")).toHaveCount(1);
  await page.getByLabel("Search notebooks").fill("");
  await page
    .getByRole("button", { name: "Notebook options", exact: true })
    .click();
  await page.getByRole("button", { name: "Move to trash" }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".notebook-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Notebook options", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore notebook" }).click();
  await expect(page.locator(".notebook-item")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review folder", exact: true })
    .click();
  await expect(page.locator(".notebook-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await expect(
    page.getByText("Shared notebooks need a collaboration service.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Question for tutor")
    .fill("Help me understand this page");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/tutor"));
  await page.getByRole("button", { name: "Send question" }).click();
  expect((await response).status()).toBe(503);
  await expect(page.locator(".ai-error")).toContainText("OPENAI_API_KEY");
  await expect(page.locator('[data-layer="ai"] [data-element-id]')).toHaveCount(
    0,
  );
});
