import { describe, expect, it } from "vitest";
import * as placement from "./annotations.js";
import { getBounds, intersectBounds } from "./canvas.js";

const note = (extra = {}) => ({
  type: "text",
  x: 100,
  y: 100,
  width: 300,
  height: 80,
  text: "Try factoring first",
  color: "#8057ba",
  ...extra,
});
const ink = {
  id: "ink",
  type: "stroke",
  points: [
    [40, 40],
    [450, 220],
  ],
  width: 12,
};
const place = (...args) => placement.placeAnnotations(...args);

describe("annotation placement", () => {
  it("rejects out-of-range or malformed annotations without affecting valid target marks", () => {
    const invalid = [
      null,
      note({ x: -1 }),
      note({ y: 1001 }),
      note({ width: Infinity }),
      note({ x: 990, width: 20, type: "circle" }),
      note({ text: "   " }),
    ];
    const result = place([...invalid, note({ type: "circle" })], {
      elements: [],
    });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].type).toBe("ellipse");
    expect(result.skipped).toHaveLength(invalid.length);
  });
  it("uses explicit PDF occupancy without colliding with background writing", () => {
    const occupancy = [{ x: 0, y: 0, width: 800, height: 700 }];
    const result = place([note()], {
      elements: [],
      background: true,
      occupancy,
    });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].y).toBeGreaterThan(712);
    for (const invalid of [[{ x: 0, y: 0, width: NaN, height: 3 }], null]) {
      expect(
        place([note()], { elements: [], background: true, occupancy: invalid })
          .elements,
      ).toEqual([]);
    }
  });
  it("reserves target markers before text and omits colliding arrows without moving targets", () => {
    const marker = { type: "circle", x: 100, y: 100, width: 300, height: 100 };
    const arrow = { ...marker, type: "arrow" };
    const result = place([note(), marker, arrow], { elements: [ink] });
    expect(result.elements.map((e) => e.type)).toEqual(["text", "ellipse"]);
    const [text, circle] = result.elements;
    expect(circle).toMatchObject({ x: 80, width: 240 });
    expect(circle.y).toBeCloseTo(110);
    expect(circle.height).toBeCloseTo(110);
    expect(intersectBounds(text, circle)).toBe(false);
    expect(result.skipped[0].reason).toMatch(/arrow.*overlap/i);
  });
  it("keeps PDF target circles and highlights while omitting uncertain text", () => {
    const result = place(
      [note(), note({ type: "circle" }), note({ type: "highlight" })],
      { background: "data:image/png;base64,AA==", elements: [] },
    );
    expect(result.elements.map((e) => e.type)).toEqual(["ellipse", "rect"]);
    expect(result.elements[1].highlight).toBe(true);
    expect(result.skipped).toHaveLength(1);
  });
  it("places practice prompts using the same collision and PDF policy", () => {
    const page = { elements: [ink] };
    const result = placement.placePractice(
      ["Factor x² − 4.", "Solve 2x = 6."],
      page,
    );
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].text).toMatch(/1\./);
    for (const element of result.elements)
      expect(intersectBounds(element, getBounds(ink))).toBe(false);
    expect(intersectBounds(...result.elements)).toBe(false);
    expect(
      placement.placePractice(["Question"], { ...page, background: true })
        .elements,
    ).toEqual([]);
  });
  it("accepts a page object and avoids existing AI text as well as ink", () => {
    const prior = {
      type: "text",
      x: 16,
      y: 16,
      text: "W".repeat(30),
      size: 24,
      ai: true,
    };
    const page = { elements: [ink, prior] };
    const snapshot = structuredClone(page);
    const result = place([note(), note()], page);
    expect(result.elements).toHaveLength(2);
    const boxes = result.elements.map((element) => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }));
    for (const box of boxes) {
      expect(intersectBounds(box, getBounds(ink))).toBe(false);
      expect(
        intersectBounds(box, { x: 16, y: 16, width: 720, height: 36 }),
      ).toBe(false);
    }
    expect(intersectBounds(boxes[0], boxes[1])).toBe(false);
    expect(page).toEqual(snapshot);
  });
  it("skips full pages and annotations taller than the page", () => {
    const full = { type: "rect", x: 0, y: 0, width: 800, height: 1100 };
    expect(place([note()], [full]).skipped[0].reason).toMatch(
      /No safe empty space/,
    );
    expect(place([note({ text: "long ".repeat(1000) })], []).elements).toEqual(
      [],
    );
  });
  it("does not assume PDF pixels are empty without explicit occupancy", () => {
    const result = place([note()], [], { background: true });
    expect(result.elements).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/background.*occupancy/i);
    expect(
      place([note()], [], { background: true, occupancy: [] }).elements,
    ).toHaveLength(1);
    const occupancy = [{ x: 0, y: 0, width: 800, height: 1100 }];
    expect(
      place([note()], [], { background: true, occupancy }).elements,
    ).toEqual([]);
  });
  it("wraps long words and reserves conservative text bounds at page boundaries", () => {
    const result = place(
      [
        note({ x: 990, y: 990, width: 140, height: 1, text: "W".repeat(120) }),
        note({ x: 990, y: 990 }),
      ],
      [],
    );
    expect(result.elements).toHaveLength(2);
    for (const element of result.elements) {
      expect(element.text).toContain("\n");
      const bounds = getBounds(element);
      expect(bounds.x).toBeGreaterThanOrEqual(16);
      expect(bounds.y).toBeGreaterThanOrEqual(16);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(784);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(1084);
      expect(element.width).toBeGreaterThanOrEqual(
        Math.max(...element.text.split("\n").map((line) => line.length)) *
          element.size,
      );
    }
    expect(
      intersectBounds(
        getBounds(result.elements[0]),
        getBounds(result.elements[1]),
      ),
    ).toBe(false);
  });
  it("returns new AI elements in document coordinates without mutating existing ink", () => {
    const original = structuredClone(ink);
    const result = place([note()], [ink]);
    expect(result.skipped).toEqual([]);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      ai: true,
      type: "text",
      size: 22,
    });
    expect(intersectBounds(getBounds(result.elements[0]), getBounds(ink))).toBe(
      false,
    );
    expect(ink).toEqual(original);
    expect(result.elements[0].id).toEqual(expect.any(String));
  });
});
