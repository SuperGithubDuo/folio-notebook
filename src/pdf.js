import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InkElement } from "./NotebookCanvas.jsx";

import { jsPDF } from "jspdf";

const h = React.createElement;

/** Snapshot synchronously, before waiting on fonts or decoding any images. */
export async function renderPageImage(page) {
  const snapshot = structuredClone(page);
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1100;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");
  // Decode embedded background resources explicitly instead of relying on SVG
  // nested-image loading, which has no independently observable readiness event.
  if (snapshot.background?.startsWith("data:")) {
    const background = new Image();
    background.src = snapshot.background;
    await background.decode();
  }
  const url = URL.createObjectURL(
    new Blob([renderPageSvg(snapshot)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Export committed pages without mounting or navigating the active notebook. */
export async function exportPages(pages, name = "Notebook") {
  const snapshot = structuredClone(pages);
  if (!snapshot.length) throw new Error("There are no pages to export");
  const pdf = new jsPDF({
    unit: "px",
    format: [800, 1100],
    hotfixes: ["px_scaling"],
  });
  for (const [index, page] of snapshot.entries()) {
    const image = await renderPageImage(page);
    if (index) pdf.addPage([800, 1100]);
    pdf.addImage(image, "PNG", 0, 0, 800, 1100);
  }
  await pdf.save(`${name}.pdf`, { returnPromise: true });
  return pdf;
}

/** A self-contained committed page, with no selection or live editor state. */
export function renderPageSvg(page) {
  const pattern =
    page.paper === "grid"
      ? h("path", {
          d: "M 25 0 H 0 V 25",
          fill: "none",
          stroke: "#e4e9ef",
          strokeWidth: 0.65,
        })
      : page.paper === "lined"
        ? h("path", {
            d: "M 0 25 H 25",
            fill: "none",
            stroke: "#dce4ed",
            strokeWidth: 1,
          })
        : page.paper === "dotted"
          ? h("circle", { cx: 2, cy: 2, r: 0.8, fill: "#d6dde6" })
          : null;
  return renderToStaticMarkup(
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: 800,
        height: 1100,
        viewBox: "0 0 800 1100",
      },
      h(
        "defs",
        null,
        h(
          "pattern",
          {
            id: "export-paper",
            patternUnits: "userSpaceOnUse",
            width: page.paper === "dotted" ? 20 : 25,
            height: 25,
          },
          pattern,
        ),
      ),
      h("rect", { width: 800, height: 1100, fill: "white" }),
      page.background?.startsWith("data:") &&
        h("image", {
          href: page.background,
          width: 800,
          height: 1100,
          preserveAspectRatio: "xMidYMid meet",
        }),
      h("rect", {
        "data-paper": page.paper,
        width: 800,
        height: 1100,
        fill: pattern ? "url(#export-paper)" : "none",
      }),
      ...[false, true].map((ai) =>
        h(
          "g",
          { key: String(ai), "data-layer": ai ? "ai" : "student" },
          (page.elements || [])
            .filter((e) => Boolean(e.ai) === ai)
            .map((e) => h(InkElement, { key: e.id, element: e })),
        ),
      ),
    ),
  );
}
