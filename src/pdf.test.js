import { describe, expect, it } from "vitest";
import { renderPageSvg } from "./pdf.js";

describe("isolated PDF page rendering", () => {
  it("renders an independent page with paper, background and shared ink markup", () => {
    const page = Object.freeze({
      id: "snapshot",
      paper: "grid",
      background: "data:image/png;base64,example",
      elements: Object.freeze([
        {
          id: "student",
          type: "rect",
          x: 20,
          y: 30,
          width: 50,
          height: 60,
          color: "#123456",
        },
        {
          id: "annotation",
          type: "text",
          x: 80,
          y: 90,
          text: "<annotation>",
          ai: true,
        },
      ]),
    });
    const svg = renderPageSvg(page);
    expect(svg).toContain('viewBox="0 0 800 1100"');
    expect(svg).toContain('data-paper="grid"');
    expect(svg).toContain('href="data:image/png;base64,example"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('data-element-id="student"');
    expect(svg).toContain('data-element-id="annotation"');
    expect(svg).toContain("&lt;annotation&gt;");
    expect(svg.indexOf('data-layer="student"')).toBeLessThan(
      svg.indexOf('data-layer="ai"'),
    );
    expect(svg).not.toContain("data-selection");
    expect(svg).not.toContain("data-preview");
  });
});
