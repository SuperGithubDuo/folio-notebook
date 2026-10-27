import { test, expect } from "@playwright/test";
import os from "node:os";
const address =
  process.env.FOLIO_LAN_URL ||
  `http://${
    Object.values(os.networkInterfaces())
      .flat()
      .find(
        (n) =>
          n.family === "IPv4" &&
          !n.internal &&
          /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
      )?.address
  }:5173`;
test("HTTP LAN loads without randomUUID, creates ink, saves, and navigates pages", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(address);
  const features = await page.evaluate(() => ({
    secure: isSecureContext,
    uuid: typeof crypto.randomUUID,
    bytes: typeof crypto.getRandomValues,
  }));
  expect(features).toEqual({
    secure: false,
    uuid: "undefined",
    bytes: "function",
  });
  if (
    await page
      .getByRole("button", { name: "Open library", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open library", exact: true })
      .click();
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("LAN handwriting");
  await page.getByRole("button", { name: "Create notebook" }).click();
  if (
    await page
      .getByRole("button", { name: "Collapse library", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Collapse library", exact: true })
      .click();
  const svg = page.locator(".notebook-svg");
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + 55, b.y + 70);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 120, { steps: 8 });
  await page.mouse.up();
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  const id = await svg
    .locator("[data-element-id]")
    .getAttribute("data-element-id");
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  if (
    !(await page
      .getByRole("button", { name: "Add page", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: "Toggle page panel" }).click();
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(svg.locator("[data-element-id]")).toHaveCount(0);
  await page.locator(".page-thumb").first().click();
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".notebook-title")).toContainText(
    "LAN handwriting",
  );
  await expect(svg.locator("[data-element-id]")).toHaveCount(1);
  const annotation = await page.evaluate(async () => {
    const { placeAnnotations } = await import("/src/annotations.js");
    return placeAnnotations(
      [
        {
          type: "text",
          x: 50,
          y: 700,
          width: 200,
          height: 100,
          text: "Keep going",
          color: "#8057ba",
        },
      ],
      { elements: [] },
    ).elements[0].id;
  });
  expect(annotation).toMatch(/^[a-f0-9-]{36}$/);
  expect(errors).toEqual([]);
});
