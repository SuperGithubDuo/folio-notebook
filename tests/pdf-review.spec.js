import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
import fs from "node:fs/promises";

test("isolated PDF helper captures immutable backgrounds and annotated ink", async ({
  page,
}) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  const result = await page.evaluate(async () => {
    const { exportPages, renderPageImage } = await import("/src/pdf.js");
    const background = (color) => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 1100;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 800, 1100);
      return c.toDataURL();
    };
    const pages = ["#ff0000", "#00b400", "#0000ff"].map((color, i) => ({
      id: String(i),
      paper: "blank",
      background: background(color),
      elements: [],
    }));
    pages[1].elements.push({
      id: "annotation",
      type: "stroke",
      points: [
        [200, 300, 1],
        [400, 300, 1],
      ],
      width: 32,
      color: "#111111",
      ai: true,
    });
    const imagePending = renderPageImage(pages[1]);
    const pdfPending = exportPages(pages, "Snapshot capture");
    pages[1].elements = [];
    pages[1].background = background("#ffff00");
    pages.reverse();
    const png = await imagePending;
    const image = new Image();
    image.src = png;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    await pdfPending;
    return {
      size: [c.width, c.height],
      ink: [...ctx.getImageData(300, 300, 1, 1).data].slice(0, 3),
      background: [...ctx.getImageData(100, 500, 1, 1).data].slice(0, 3),
    };
  });
  expect(result.size).toEqual([800, 1100]);
  expect(result.ink.every((v) => v < 40)).toBeTruthy();
  expect(result.background).toEqual([0, 180, 0]);
  const download = await downloadPromise;
  const bytes = await fs.readFile(await download.path());
  const samples = await page.evaluate(async (data) => {
    const pdfjs = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
    });
    const doc = await task.promise;
    const samples = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i),
        viewport = p.getViewport({ scale: 1 }),
        c = document.createElement("canvas");
      c.width = viewport.width;
      c.height = viewport.height;
      const ctx = c.getContext("2d");
      await p.render({ canvasContext: ctx, viewport }).promise;
      const sample = (x, y) =>
        [
          ...ctx.getImageData(
            Math.floor((x * c.width) / 800),
            Math.floor((y * c.height) / 1100),
            1,
            1,
          ).data,
        ].slice(0, 3);
      samples.push({ background: sample(100, 500), ink: sample(300, 300) });
    }
    await task.destroy();
    return samples;
  }, bytes.toString("base64"));
  expect(samples).toHaveLength(3);
  expect(samples.map((s) => s.background)).toEqual([
    [255, 0, 0],
    [0, 180, 0],
    [0, 0, 255],
  ]);
  expect(samples[1].ink.every((v) => v < 40)).toBeTruthy();
});
test("page image keeps non-page-shaped backgrounds proportional and waits for readiness", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { renderPageImage } = await import("/src/pdf.js");
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#a020f0";
    ctx.fillRect(0, 0, 400, 200);
    let release;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    Object.defineProperty(document.fonts, "ready", {
      configurable: true,
      value: ready,
    });
    let decoded = 0;
    const decode = Image.prototype.decode;
    Image.prototype.decode = function () {
      decoded++;
      return decode.call(this);
    };
    const pending = renderPageImage({
      paper: "blank",
      background: c.toDataURL(),
      elements: [],
    });
    await Promise.resolve();
    const before = decoded;
    release();
    const png = await pending;
    delete document.fonts.ready;
    Image.prototype.decode = decode;
    const image = new Image();
    image.src = png;
    await image.decode();
    c.width = 800;
    c.height = 1100;
    ctx.drawImage(image, 0, 0);
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return {
      before,
      decoded,
      top: pixel(400, 100),
      center: pixel(400, 550),
      bottom: pixel(400, 1000),
    };
  });
  expect(result.before).toBe(0);
  expect(result.decoded).toBeGreaterThanOrEqual(2);
  expect(result.top).toEqual([255, 255, 255]);
  expect(result.center).toEqual([160, 32, 240]);
  expect(result.bottom).toEqual([255, 255, 255]);
});

test("multipage PDF exports snapshot pages in order without navigating the notebook", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("PDF review");
  await page.getByRole("button", { name: "Create notebook" }).click();
  const source = new jsPDF({ unit: "px", format: [800, 1100] });
  for (const [i, color] of [
    [255, 0, 0],
    [0, 180, 0],
    [0, 0, 255],
  ].entries()) {
    if (i) source.addPage([800, 1100]);
    source.setFillColor(...color);
    source.rect(0, 0, 800, 1100, "F");
    source.setTextColor(255, 255, 255);
    source.text(`SOURCE PAGE ${i + 1}`, 40, 50);
  }
  await page.locator("input[type=file]").setInputFiles({
    name: "colors.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(source.output("arraybuffer")),
  });
  await expect(page.locator(".page-thumb")).toHaveCount(4);
  await expect(page.locator(".busy-banner")).toHaveCount(0);
  await page.evaluate(() => {
    window.exportNavigations = [];
    new MutationObserver(() => {
      const n = [...document.querySelectorAll(".page-thumb")].findIndex((e) =>
        e.classList.contains("current"),
      );
      window.exportNavigations.push(n);
    }).observe(document.querySelector(".page-list"), {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notebook as PDF" }).click();
  const download = await downloadPromise;
  const bytes = await fs.readFile(await download.path());
  const samples = await page.evaluate(async (data) => {
    const pdfjs = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))),
    });
    const doc = await task.promise;
    const result = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i),
        viewport = p.getViewport({ scale: 0.15 }),
        c = document.createElement("canvas");
      c.width = viewport.width;
      c.height = viewport.height;
      await p.render({ canvasContext: c.getContext("2d"), viewport }).promise;
      result.push(
        [...c.getContext("2d").getImageData(35, 50, 1, 1).data].slice(0, 3),
      );
    }
    await task.destroy();
    return result;
  }, bytes.toString("base64"));
  expect(samples).toHaveLength(4);
  expect(samples[0].every((v) => v > 245)).toBeTruthy();
  expect(samples[1][0]).toBeGreaterThan(240);
  expect(samples[1][1]).toBeLessThan(20);
  expect(samples[2][1]).toBeGreaterThan(150);
  expect(samples[2][0]).toBeLessThan(20);
  expect(samples[3][2]).toBeGreaterThan(240);
  expect(samples[3][0]).toBeLessThan(20);
  expect(await page.evaluate(() => window.exportNavigations)).toEqual([]);
});
test("invalid PDF leaves notebook unchanged with a clear failure", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await expect(page.getByRole("status")).toContainText("Import failed");
  await expect(page.locator(".page-thumb")).toHaveCount(3);
  await expect(page.locator(".busy-banner")).toHaveCount(0);
});
test("ink survives reloading immediately after a committed stroke", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Immediate reload");
  await page.getByRole("button", { name: "Create notebook" }).click();
  const b = await page.locator(".notebook-svg").boundingBox();
  await page.mouse.move(b.x + 70, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 150, b.y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".notebook-title")).toContainText(
    "Immediate reload",
  );
  await expect(page.locator(".notebook-svg [data-element-id]")).toHaveCount(1);
});
