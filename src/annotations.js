import { getBounds, intersectBounds } from "./canvas.js";

const PAGE = { width: 800, height: 1100 };
const MARGIN = 16;
const PADDING = 12;
const SIZE = 22;
const expand = (b, pad = PADDING) => ({
  x: b.x - pad,
  y: b.y - pad,
  width: b.width + 2 * pad,
  height: b.height + 2 * pad,
});
const inside = (b) =>
  b.x >= MARGIN &&
  b.y >= MARGIN &&
  b.x + b.width <= PAGE.width - MARGIN &&
  b.y + b.height <= PAGE.height - MARGIN;
const clear = (b, occupied) =>
  inside(b) && !occupied.some((other) => intersectBounds(b, expand(other)));
const valid = (annotation) =>
  annotation &&
  ["text", "circle", "highlight", "arrow"].includes(annotation.type) &&
  ["x", "y", "width", "height"].every(
    (key) =>
      Number.isFinite(annotation[key]) &&
      annotation[key] >= 0 &&
      annotation[key] <= 1000,
  ) &&
  (annotation.type === "text"
    ? typeof annotation.text === "string" && Boolean(annotation.text.trim())
    : annotation.x + annotation.width <= 1000 &&
      annotation.y + annotation.height <= 1000);
const toBox = (annotation) => ({
  x: annotation.x * 0.8,
  y: annotation.y * 1.1,
  width: annotation.width * 0.8,
  height: annotation.height * 1.1,
});

/**
 * Convert normalized 0..1000 annotations to NEW canvas elements (not the input
 * elements). skipped contains { annotation, reason }; explanations remain in chat.
 * Background pixels cannot be inferred from canvas elements. On PDF/image pages,
 * text/arrows are skipped unless occupancy is an explicit complete array of
 * document-coordinate rectangles, including background writing. [] explicitly
 * asserts the background is blank; omitting it makes no free-space claim.
 */
export function placeAnnotations(annotations, page = {}, options = {}) {
  // Retain the original (annotations, elements, options) integration too.
  const elements = Array.isArray(page) ? page : page.elements || [];
  const { background = false, occupancy } = Array.isArray(page)
    ? options
    : page;
  const validOccupancy =
    Array.isArray(occupancy) &&
    occupancy.every(
      (box) =>
        box &&
        ["x", "y", "width", "height"].every((key) =>
          Number.isFinite(box[key]),
        ) &&
        box.width >= 0 &&
        box.height >= 0,
    );
  const occupied = elements
    .map((element) => {
      const bounds = getBounds(element);
      if (bounds && element.type === "text") {
        const lines = String(element.text || "").split("\n");
        return {
          ...bounds,
          width:
            Math.max(1, ...lines.map((line) => line.length)) *
            (element.size || 24),
          height: lines.length * (element.size || 24) * 1.5,
        };
      }
      return bounds ? expand(bounds, (element.strokeWidth || 0) / 2) : null;
    })
    .filter(Boolean);
  if (validOccupancy) occupied.push(...occupancy);
  // Reserve targets before placing any text, regardless of model array order.
  occupied.push(
    ...annotations
      .filter((a) => valid(a) && ["circle", "highlight"].includes(a.type))
      .map(toBox),
  );
  const placed = [],
    skipped = [];
  for (const annotation of annotations) {
    const skip = (reason) => skipped.push({ annotation, reason });
    if (!valid(annotation)) {
      skip("Invalid annotation geometry.");
      continue;
    }
    if (
      background &&
      !validOccupancy &&
      ["text", "arrow"].includes(annotation.type)
    ) {
      skip("Background occupancy is unknown; keep the explanation in chat.");
      continue;
    }
    let box = toBox(annotation);
    if (annotation.type === "arrow" && !clear(expand(box, 10), occupied)) {
      skip(
        "Arrow would overlap existing content or page bounds; keep the explanation in chat.",
      );
      continue;
    }
    const element = {
      ...box,
      id: globalThis.crypto.randomUUID(),
      ai: true,
      type: annotation.type,
      color: /^#[0-9a-f]{6}$/i.test(annotation.color)
        ? annotation.color
        : "#8057ba",
      strokeWidth: 2.5,
      size: SIZE,
      text: annotation.text || "",
    };
    if (annotation.type === "text") {
      // One em per UTF-16 code unit deliberately overestimates Latin/CJK glyphs;
      // canvas.getBounds uses only 0.6 em and is insufficient for safe placement.
      const maxWidth = Math.max(SIZE * 4, Math.min(360, box.width || 240));
      const columns = Math.floor(maxWidth / SIZE);
      const lines = [];
      for (const paragraph of String(element.text).split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (line && line.length + 1 + word.length <= columns)
            line += ` ${word}`;
          else {
            if (line) lines.push(line);
            let rest = word;
            while (rest.length > columns) {
              lines.push(rest.slice(0, columns));
              rest = rest.slice(columns);
            }
            line = rest;
          }
        }
        lines.push(line);
      }
      element.text = lines.join("\n");
      box.width = Math.max(1, ...lines.map((line) => line.length)) * SIZE;
      box.height = lines.length * SIZE * 1.5;
      if (!clear(box, occupied)) {
        let found;
        for (
          let y = MARGIN;
          y <= PAGE.height - MARGIN - box.height && !found;
          y += 16
        ) {
          for (let x = MARGIN; x <= PAGE.width - MARGIN - box.width; x += 16) {
            const candidate = { ...box, x, y };
            if (clear(candidate, occupied)) {
              found = candidate;
              break;
            }
          }
        }
        if (!found) {
          skip("No safe empty space; explanation remains in chat.");
          continue;
        }
        box = found;
      }
    }
    if (annotation.type === "circle") element.type = "ellipse";
    if (annotation.type === "highlight") {
      element.type = "rect";
      element.highlight = true;
    }
    Object.assign(element, box);
    placed.push(element);
    occupied.push(box);
  }
  return { elements: placed, skipped };
}

/** Numbered exercises use exactly the same occupancy and wrapping policy. */
export function placePractice(prompts, page = {}) {
  return placeAnnotations(
    prompts.map((text, index) => ({
      type: "text",
      x: 60,
      y: 100,
      width: 450,
      height: 0,
      text: `${index + 1}. ${text}`,
      color: "#8057ba",
    })),
    page,
  );
}
