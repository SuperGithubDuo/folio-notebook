import React, {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  getBounds,
  intersectBounds,
  pathFromPoints,
  elementsInBounds,
  moveElements,
  resizeElements,
} from "./canvas.js";

const FONT = "'Caveat', 'Segoe Print', cursive";
import { uid } from "./ids.js";

export function InkElement({ element: e }) {
  const common = { "data-element-id": e.id };
  if (e.type === "stroke")
    return (
      <path
        {...common}
        d={pathFromPoints(e.points, e.width || 2)}
        fill={e.color || "#243247"}
        opacity={e.highlighter ? 0.28 : e.pencil ? 0.72 : 1}
      />
    );
  if (e.type === "text")
    return (
      <text
        {...common}
        x={e.x}
        y={e.y}
        fill={e.color || "#243247"}
        style={{ fontFamily: FONT, fontSize: e.size || 24, fontWeight: 400 }}
        dominantBaseline="text-before-edge"
      >
        {String(e.text)
          .split("\n")
          .map((line, i) => (
            <tspan key={i} x={e.x} dy={i ? (e.size || 24) * 1.25 : 0}>
              {line || " "}
            </tspan>
          ))}
      </text>
    );
  const b = getBounds(e),
    shape = {
      ...common,
      fill: "none",
      stroke: e.color || "#243247",
      strokeWidth: e.strokeWidth || 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  if (e.type === "rect")
    return (
      <rect
        {...shape}
        {...b}
        fill={e.highlight ? e.color || "#f3cf55" : "none"}
        fillOpacity={e.highlight ? 0.18 : undefined}
      />
    );
  if (e.type === "ellipse")
    return (
      <ellipse
        {...shape}
        cx={b.x + b.width / 2}
        cy={b.y + b.height / 2}
        rx={b.width / 2}
        ry={b.height / 2}
      />
    );
  const x = e.x + e.width,
    y = e.y + e.height,
    a = Math.atan2(e.height, e.width),
    r = Math.max(10, (e.strokeWidth || 2) * 4);
  return (
    <path
      {...shape}
      d={`M ${e.x} ${e.y} L ${x} ${y} M ${x - r * Math.cos(a - 0.45)} ${y - r * Math.sin(a - 0.45)} L ${x} ${y} L ${x - r * Math.cos(a + 0.45)} ${y - r * Math.sin(a + 0.45)}`}
    />
  );
}

const NotebookCanvas = forwardRef(function NotebookCanvas(
  {
    page,
    onChange,
    tool = "pen",
    color = "#243247",
    thickness = 2.5,
    zoom = 1,
    onSelection,
    onAskAI,
  },
  ref,
) {
  const svgRef = useRef(null);
  const patternId = `paper-${useId().replace(/:/g, "")}`;
  const elements = page.elements || [];
  const [preview, setPreview] = useState(null),
    [working, setWorking] = useState(null),
    [ids, setIds] = useState([]),
    [region, setRegion] = useState(null),
    [editor, setEditor] = useState(null);
  const gesture = useRef(null),
    lastPen = useRef(0),
    selectionCallback = useRef(onSelection),
    editorRef = useRef(null);
  selectionCallback.current = onSelection;
  const displayed = working || elements;
  const selected = displayed.filter((e) => ids.includes(e.id));
  const bounds = getBounds(selected);
  useEffect(() => {
    setIds([]);
    setPreview(null);
    setWorking(null);
    setEditor(null);
    setRegion(null);
    gesture.current = null;
  }, [page.id]);
  useEffect(() => {
    selectionCallback.current?.({ ids: selected.map((e) => e.id), bounds });
  }, [ids, elements, working]);
  useEffect(() => {
    if (tool !== "lasso") setIds([]);
  }, [tool]);
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [Boolean(editor)]);
  function finishText(cancel = false) {
    if (!editor || editorRef.current?.dataset.committed === "true") return;
    if (editorRef.current) editorRef.current.dataset.committed = "true";
    if (!cancel && editor.text.trim())
      onChange?.([
        ...elements,
        {
          id: uid(),
          type: "text",
          x: editor.x,
          y: editor.y,
          text: editor.text,
          color: editor.color,
          size: editor.size,
        },
      ]);
    setEditor(null);
  }
  useImperativeHandle(
    ref,
    () => ({
      async exportImage(selectionOnly = false) {
        // Snapshot the requested page synchronously: navigation can occur while
        // fonts are loading, but must never change the image sent to the tutor.
        const source = svgRef.current,
          clone = source.cloneNode(true);
        clone
          .querySelectorAll("[data-preview], [data-selection]")
          .forEach((n) => n.remove());
        if (selectionOnly && ids.length)
          clone.querySelectorAll("[data-element-id]").forEach((n) => {
            if (!ids.includes(n.getAttribute("data-element-id"))) n.remove();
          });
        // Inline live computed typography; export never fetches external fonts or images.
        const originalText = source.querySelectorAll("text");
        clone.querySelectorAll("text").forEach((node) => {
          const original = Array.from(originalText).find(
            (n) =>
              n.getAttribute("data-element-id") ===
              node.getAttribute("data-element-id"),
          );
          if (original) {
            const style = getComputedStyle(original);
            for (const key of [
              "font-family",
              "font-size",
              "font-weight",
              "font-style",
              "letter-spacing",
              "line-height",
            ])
              node.style.setProperty(key, style.getPropertyValue(key));
          }
        });
        const crop =
          selectionOnly && bounds
            ? {
                x: Math.max(0, bounds.x - 12),
                y: Math.max(0, bounds.y - 12),
                width: bounds.width + 24,
                height: bounds.height + 24,
              }
            : { x: 0, y: 0, width: 800, height: 1100 };
        clone.setAttribute(
          "viewBox",
          `${crop.x} ${crop.y} ${crop.width} ${crop.height}`,
        );
        clone.setAttribute("width", Math.ceil(crop.width));
        clone.setAttribute("height", Math.ceil(crop.height));
        clone.style.background = "white";
        await document.fonts?.ready;
        const url = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(clone)], {
            type: "image/svg+xml;charset=utf-8",
          }),
        );
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(crop.width);
          canvas.height = Math.ceil(crop.height);
          const context = canvas.getContext("2d");
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          return canvas.toDataURL("image/png");
        } finally {
          URL.revokeObjectURL(url);
        }
      },
    }),
    [page, ids, bounds],
  );
  const point = (e) => {
    const box = svgRef.current.getBoundingClientRect();
    return [
      ((e.clientX - box.left) * 800) / box.width,
      ((e.clientY - box.top) * 1100) / box.height,
      e.pointerType === "pen" ? (e.pressure ?? 0.5) : 0.65,
    ];
  };
  function eraseAt(g, p) {
    const radius = Math.max(6, thickness * 2);
    // Sample the swept eraser so fast pointer moves cannot skip thin ink.
    const last = g.last || p,
      distance = Math.hypot(p[0] - last[0], p[1] - last[1]);
    for (let i = 0, n = Math.max(1, Math.ceil(distance / 3)); i <= n; i++) {
      const x = last[0] + ((p[0] - last[0]) * i) / n,
        y = last[1] + ((p[1] - last[1]) * i) / n;
      const box = {
        x: x - radius,
        y: y - radius,
        width: radius * 2,
        height: radius * 2,
      };
      g.next = g.next.filter((el) => {
        if (!intersectBounds(getBounds(el), box)) return true;
        if (el.type !== "stroke") return false;
        return !el.points.some((a, j) => {
          const b = el.points[j + 1] || a,
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            den = dx * dx + dy * dy;
          const t = den
            ? Math.max(
                0,
                Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / den),
              )
            : 0;
          return (
            Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <=
            radius + (el.width || 2) / 2
          );
        });
      });
    }
    g.last = p;
    setWorking(g.next);
  }
  function down(e) {
    if (
      e.button !== 0 ||
      gesture.current ||
      (e.pointerType === "touch" && Date.now() - lastPen.current < 1500)
    )
      return;
    if (e.pointerType === "pen") lastPen.current = Date.now();
    e.preventDefault();
    svgRef.current.focus({ preventScroll: true });
    if (
      tool !== "text" &&
      (svgRef.current.hasPointerCapture(e.pointerId) || e.nativeEvent.isTrusted)
    )
      svgRef.current.setPointerCapture(e.pointerId);
    const p = point(e),
      base = {
        pointerId: e.pointerId,
        start: p,
        original: elements,
        kind: tool,
      };
    if (tool === "text") {
      finishText();
      setEditor({
        x: p[0],
        y: p[1],
        text: "",
        color,
        size: Math.max(22, thickness * 7),
      });
      return;
    }
    if (tool === "hand") {
      const scroll = svgRef.current.closest(".canvas-scroll");
      gesture.current = {
        ...base,
        scroll,
        client: [e.clientX, e.clientY],
        left: scroll?.scrollLeft,
        top: scroll?.scrollTop,
      };
      return;
    }
    if (tool === "lasso") {
      if (bounds && e.target.closest("[data-selection-handle]"))
        gesture.current = { ...base, kind: "resize", bounds, next: elements };
      else if (
        bounds &&
        intersectBounds(bounds, { x: p[0], y: p[1], width: 0, height: 0 })
      )
        gesture.current = { ...base, kind: "move", next: elements };
      else {
        setIds([]);
        setRegion({ x: p[0], y: p[1], width: 0, height: 0 });
        gesture.current = {
          ...base,
          region: { x: p[0], y: p[1], width: 0, height: 0 },
        };
      }
      return;
    }
    if (tool === "eraser") {
      const g = { ...base, next: elements };
      gesture.current = g;
      eraseAt(g, p);
      return;
    }
    const stroke = ["pen", "pencil", "highlighter"].includes(tool)
      ? {
          id: uid(),
          type: "stroke",
          points: [p],
          color,
          width: thickness * (tool === "highlighter" ? 7 : 1),
          pencil: tool === "pencil",
          highlighter: tool === "highlighter",
        }
      : {
          id: uid(),
          type: tool,
          x: p[0],
          y: p[1],
          width: 0,
          height: 0,
          color,
          strokeWidth: thickness,
        };
    gesture.current = { ...base, stroke };
    setPreview(stroke);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.preventDefault();
    if (e.pointerType === "pen") lastPen.current = Date.now();
    const p = point(e),
      dx = p[0] - g.start[0],
      dy = p[1] - g.start[1];
    if (g.kind === "hand") {
      if (g.scroll) {
        g.scroll.scrollLeft = g.left + g.client[0] - e.clientX;
        g.scroll.scrollTop = g.top + g.client[1] - e.clientY;
      }
      return;
    }
    if (g.kind === "eraser") {
      eraseAt(g, p);
      return;
    }
    if (g.kind === "lasso") {
      g.region = {
        x: Math.min(p[0], g.start[0]),
        y: Math.min(p[1], g.start[1]),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
      setRegion(g.region);
      return;
    }
    if (g.kind === "move") {
      g.next = moveElements(g.original, ids, dx, dy);
      setWorking(g.next);
      return;
    }
    if (g.kind === "resize") {
      g.next = resizeElements(g.original, ids, g.bounds, {
        ...g.bounds,
        width: Math.max(8, p[0] - g.bounds.x),
        height: Math.max(8, p[1] - g.bounds.y),
      });
      setWorking(g.next);
      return;
    }
    if (g.stroke.type !== "stroke") {
      g.stroke = { ...g.stroke, width: dx, height: dy };
      setPreview(g.stroke);
      return;
    }
    const samples = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [e]) {
      const next = point(sample),
        last = g.stroke.points.at(-1);
      if (Math.hypot(next[0] - last[0], next[1] - last[1]) > 0.2)
        g.stroke.points.push(next);
    }
    setPreview({ ...g.stroke, points: [...g.stroke.points] });
  }
  function up(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (e.type !== "pointercancel") {
      // Pointerup can carry a newer position than the last pointermove.
      move(e);
      if (g.kind === "lasso")
        setIds(elementsInBounds(elements, g.region).map((el) => el.id));
      else if (
        g.next &&
        (g.kind !== "eraser" || g.next.length !== g.original.length)
      ) {
        if (JSON.stringify(g.next) !== JSON.stringify(g.original))
          onChange?.(g.next);
      } else if (g.stroke) onChange?.([...elements, g.stroke]);
    }
    gesture.current = null;
    setPreview(null);
    setWorking(null);
    setRegion(null);
    if (svgRef.current.hasPointerCapture(e.pointerId))
      svgRef.current.releasePointerCapture(e.pointerId);
  }
  function keyDown(e) {
    if (e.target.closest('textarea,input,[contenteditable="true"]')) return;
    if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
      e.preventDefault();
      onChange?.(elements.filter((el) => !ids.includes(el.id)));
      setIds([]);
    }
    if (e.key === "Escape") {
      setIds([]);
      gesture.current = null;
      setWorking(null);
      setPreview(null);
      setRegion(null);
    }
  }
  return (
    <div
      onKeyDown={keyDown}
      className="notebook-canvas"
      style={{
        position: "relative",
        width: 800 * zoom,
        height: 1100 * zoom,
        flexShrink: 0,
      }}
    >
      <svg
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        ref={svgRef}
        className="notebook-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 1100"
        width={800 * zoom}
        height={1100 * zoom}
        tabIndex={0}
        role="application"
        aria-label="Notebook handwriting canvas"
        style={{
          display: "block",
          background: "#fff",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={page.paper === "dotted" ? 20 : 25}
            height={25}
          >
            {page.paper === "grid" && (
              <path
                d="M 25 0 H 0 V 25"
                fill="none"
                stroke="#e4e9ef"
                strokeWidth=".65"
              />
            )}
            {page.paper === "lined" && (
              <path
                d="M 0 25 H 25"
                fill="none"
                stroke="#dce4ed"
                strokeWidth="1"
              />
            )}
            {page.paper === "dotted" && (
              <circle cx="2" cy="2" r=".8" fill="#d6dde6" />
            )}
          </pattern>
        </defs>
        <rect width="800" height="1100" fill="white" />
        {page.background?.startsWith("data:") && (
          <image
            href={page.background}
            width="800"
            height="1100"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        <rect
          data-paper={page.paper}
          width="800"
          height="1100"
          fill={page.paper === "blank" ? "none" : `url(#${patternId})`}
        />
        <g data-layer="student">
          {displayed
            .filter((e) => !e.ai)
            .map((e) => (
              <InkElement key={e.id} element={e} />
            ))}
        </g>
        <g data-layer="ai">
          {displayed
            .filter((e) => e.ai)
            .map((e) => (
              <InkElement key={e.id} element={e} />
            ))}
        </g>
        {preview && (
          <g data-preview="true" pointerEvents="none">
            <InkElement element={preview} />
          </g>
        )}
        {(region || bounds) && (
          <g data-selection="true">
            <rect
              {...(region || bounds)}
              fill="rgba(114,83,214,.04)"
              stroke="#8b6cda"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              pointerEvents="none"
            />
            {bounds && !region && (
              <rect
                data-selection-handle="true"
                x={bounds.x + bounds.width - 5}
                y={bounds.y + bounds.height - 5}
                width="10"
                height="10"
                rx="2"
                fill="white"
                stroke="#8b6cda"
                strokeWidth="2"
                style={{ cursor: "nwse-resize" }}
              />
            )}
          </g>
        )}
      </svg>
      {bounds && !region && (
        <div
          className="selection-actions"
          style={{
            position: "absolute",
            left: Math.max(0, bounds.x * zoom),
            top: Math.max(0, bounds.y * zoom - 42),
            zIndex: 3,
          }}
        >
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              onAskAI?.({ ids: selected.map((e) => e.id), bounds })
            }
          >
            Ask AI
          </button>
          <button
            type="button"
            aria-label="Delete selection"
            onClick={() => {
              onChange?.(elements.filter((e) => !ids.includes(e.id)));
              setIds([]);
            }}
          >
            Delete
          </button>
        </div>
      )}
      {editor && (
        <textarea
          ref={editorRef}
          aria-label="Note text"
          value={editor.text}
          onChange={(e) => setEditor({ ...editor, text: e.target.value })}
          onBlur={() => finishText()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              finishText(true);
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              finishText();
              svgRef.current.focus();
            }
          }}
          style={{
            position: "absolute",
            left: editor.x * zoom,
            top: editor.y * zoom,
            width: Math.min(340, 800 - editor.x) * zoom,
            minHeight: 100 * zoom,
            fontFamily: FONT,
            fontSize: editor.size * zoom,
            color: editor.color,
            lineHeight: 1.25,
            padding: 0,
            border: "1px dashed #8b6cda",
            outline: "none",
            background: "rgba(255,255,255,.93)",
            resize: "both",
            zIndex: 4,
          }}
        />
      )}
    </div>
  );
});

export default NotebookCanvas;
