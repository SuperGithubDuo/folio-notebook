import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.waitForTimeout(1500);
await page.screenshot({
  path: "C:/Users/shenj/AppData/Local/hermes/cache/scratch/folio-desktop.png",
  fullPage: true,
});
console.log(
  JSON.stringify({
    errors,
    title: await page.title(),
    bodyWidth: await page.locator("body").evaluate((e) => e.scrollWidth),
  }),
);
await browser.close();
