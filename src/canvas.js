// All geometry is in the notebook's 800 × 1100 document coordinates.
export function intersectBounds(a, b) {
  return Boolean(
    a &&
    b &&
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y,
  );
}

export function elementsInBounds(elements, bounds) {
  return elements.filter((element) =>
    intersectBounds(getBounds(element), bounds),
  );
}

export function moveElements(elements, ids, dx, dy) {
  const selected = new Set(ids);
  return elements.map((e) =>
    !selected.has(e.id)
      ? e
      : e.type === "stroke"
        ? {
            ...e,
            points: e.points.map(([x, y, ...rest]) => [
              x + dx,
              y + dy,
              ...rest,
            ]),
          }
        : { ...e, x: e.x + dx, y: e.y + dy },
  );
}

export function resizeElements(elements, ids, from, to) {
  const selected = new Set(ids);
  const sx = from.width ? to.width / from.width : 1,
    sy = from.height ? to.height / from.height : 1;
  const scale = (Math.abs(sx) + Math.abs(sy)) / 2;
  const point = (x, y) => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy];
  return elements.map((e) => {
    if (!selected.has(e.id)) return e;
    if (e.type === "stroke")
      return {
        ...e,
        width: (e.width || 1) * scale,
        points: e.points.map(([x, y, ...rest]) => [...point(x, y), ...rest]),
      };
    const [x, y] = point(e.x, e.y);
    if (e.type === "text") return { ...e, x, y, size: (e.size || 24) * scale };
    return {
      ...e,
      x,
      y,
      width: e.width * sx,
      height: e.height * sy,
      strokeWidth: (e.strokeWidth || 2) * scale,
    };
  });
}

// With width supplied returns a filled pressure outline; otherwise a smooth centerline.
export function pathFromPoints(points, width) {
  if (!points?.length) return "";
  const smooth = (list) => {
    let d = `M ${list[0][0]} ${list[0][1]}`;
    for (let i = 1; i < list.length - 1; i++)
      d += ` Q ${list[i][0]} ${list[i][1]} ${(list[i][0] + list[i + 1][0]) / 2} ${(list[i][1] + list[i + 1][1]) / 2}`;
    if (list.length > 1) d += ` L ${list.at(-1)[0]} ${list.at(-1)[1]}`;
    return d;
  };
  if (width == null) return smooth(points);
  if (points.length === 1) {
    const [x, y, p = 0.5] = points[0],
      r = (width * (0.25 + 0.75 * Math.max(0, Math.min(1, p)))) / 2;
    return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
  }
  const left = [],
    right = [];
  points.forEach(([x, y, p = 0.5], i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy) || 1;
    const r = (width * (0.25 + 0.75 * Math.max(0, Math.min(1, p)))) / 2;
    left.push([x - (dy / length) * r, y + (dx / length) * r]);
    right.push([x + (dy / length) * r, y - (dx / length) * r]);
  });
  return `${smooth(left)} ${smooth(right.reverse()).replace(/^M/, "L")} Z`;
}

export function getBounds(value) {
  if (Array.isArray(value)) {
    const boxes = value.map(getBounds).filter(Boolean);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map((b) => b.x)),
      y = Math.min(...boxes.map((b) => b.y));
    return {
      x,
      y,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    };
  }
  if (!value) return null;
  if (value.type === "stroke") {
    if (!value.points?.length) return null;
    const pad = (value.width || 1) / 2;
    const xs = value.points.map((p) => p[0]),
      ys = value.points.map((p) => p[1]);
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
  }
  if (value.type === "text") {
    const size = value.size || 24,
      lines = String(value.text || "").split("\n");
    return {
      x: value.x,
      y: value.y,
      width: Math.max(1, ...lines.map((l) => l.length)) * size * 0.6,
      height: lines.length * size * 1.25,
    };
  }
  return {
    x: Math.min(value.x, value.x + value.width),
    y: Math.min(value.y, value.y + value.height),
    width: Math.abs(value.width),
    height: Math.abs(value.height),
  };
}
