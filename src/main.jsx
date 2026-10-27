import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  PanelLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Star,
  Users,
  Trash2,
  Folder,
  MoreHorizontal,
  Settings,
  Sun,
  Moon,
  PenLine,
  Pencil,
  Highlighter,
  Eraser,
  Scan,
  Type,
  Square,
  Circle,
  MoveUpRight,
  Hand,
  Undo2,
  Redo2,
  Download,
  Upload,
  Sparkles,
  X,
  Send,
  Mic,
  Check,
  Copy,
  ArrowUp,
  ArrowDown,
  Layers,
  Maximize2,
  MessageCircle,
  Lightbulb,
  GraduationCap,
  FileText,
  ChevronsRight,
} from "lucide-react";
import NotebookCanvas from "./NotebookCanvas.jsx";
import { createLibrary, libraryReducer, newPage, uid } from "./store.js";
import { placeAnnotations, placePractice } from "./annotations.js";
import "./styles.css";
const STORAGE = "folio.library.v1";
function readInitial() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    if (
      value?.version === 1 &&
      Array.isArray(value.notebooks) &&
      value.notebooks.length &&
      Array.isArray(value.folders) &&
      value.folders.every((f) => typeof f === "string") &&
      value.notebooks.every(
        (n) =>
          typeof n.id === "string" &&
          typeof n.name === "string" &&
          Array.isArray(n.pages) &&
          n.pages.length &&
          n.pages.every(
            (p) =>
              typeof p.id === "string" &&
              Array.isArray(p.elements) &&
              p.elements.every(
                (e) =>
                  e &&
                  typeof e.id === "string" &&
                  ["stroke", "text", "rect", "ellipse", "arrow"].includes(
                    e.type,
                  ) &&
                  (e.type !== "stroke" || Array.isArray(e.points)),
              ),
          ),
      )
    )
      return value;
  } catch {}
  return createLibrary();
}
function IconButton({ icon: Icon, label, active, className = "", ...props }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      {...props}
    >
      <Icon size={19} strokeWidth={1.7} />
    </button>
  );
}
const tools = [
  ["pen", PenLine, "Pen"],
  ["pencil", Pencil, "Pencil"],
  ["highlighter", Highlighter, "Highlighter"],
  ["eraser", Eraser, "Eraser"],
  ["lasso", Scan, "Lasso selection"],
  ["text", Type, "Text box"],
  ["rect", Square, "Rectangle"],
  ["ellipse", Circle, "Ellipse"],
  ["arrow", MoveUpRight, "Arrow"],
  ["hand", Hand, "Pan"],
];
function App() {
  const [library, setLibrary] = useState(readInitial),
    [tool, setTool] = useState("pen"),
    [color, setColor] = useState("#285799"),
    [thickness, setThickness] = useState(2.5),
    [zoom, setZoom] = useState(0.78),
    [left, setLeft] = useState(() => window.innerWidth >= 1000),
    [pagesOpen, setPagesOpen] = useState(() => window.innerWidth >= 700),
    [aiOpen, setAiOpen] = useState(() => window.innerWidth >= 1100),
    [theme, setTheme] = useState(() => {
      try {
        return localStorage.getItem("folio.theme") || "light";
      } catch {
        return "light";
      }
    }),
    [filter, setFilter] = useState("Notebooks"),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(null),
    [name, setName] = useState(""),
    [saveStatus, setSaveStatus] = useState("Saved locally"),
    [toast, setToast] = useState(""),
    [selection, setSelection] = useState(null),
    [tab, setTab] = useState("Chat"),
    [mode, setMode] = useState("Guided Learning"),
    [question, setQuestion] = useState(""),
    [chats, setChats] = useState({}),
    [loading, setLoading] = useState(false),
    [errors, setErrors] = useState({}),
    [configured, setConfigured] = useState(false),
    [practice, setPractice] = useState([]),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false);
  const canvas = useRef(),
    undo = useRef({}),
    redo = useRef({}),
    fileInput = useRef(),
    chatEnd = useRef(),
    recognition = useRef();
  const nb =
    library.notebooks.find((n) => n.id === library.activeNotebook) ||
    library.notebooks.find((n) => !n.deleted) ||
    library.notebooks[0];
  const page = nb.pages.find((p) => p.id === library.activePage) || nb.pages[0];
  const messages = chats[page.id] || [];
  const error = errors[page.id] || "";
  function setError(message) {
    setErrors((s) => ({ ...s, [page.id]: message }));
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("folio.theme", theme);
    } catch {
      /* Theme still works without browser storage. */
    }
  }, [theme]);
  useEffect(() => {
    setSaveStatus("Saving…");
    // Commit on each document change, not after a cancellable debounce.
    // Pointer previews are canvas-local, so this runs only for committed ink.
    try {
      localStorage.setItem(STORAGE, JSON.stringify(library));
      setSaveStatus("Saved locally");
    } catch {
      setSaveStatus("Storage unavailable — export a backup");
    }
  }, [library]);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setConfigured(d.aiConfigured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages, loading]);
  function updateNotebook(fn) {
    setLibrary((s) => ({
      ...s,
      notebooks: s.notebooks.map((n) =>
        n.id === nb.id ? { ...fn(n), updated: Date.now() } : n,
      ),
    }));
  }
  function changeElements(elements, record = true) {
    if (record) {
      undo.current[page.id] = [
        ...(undo.current[page.id] || []),
        page.elements,
      ].slice(-60);
      redo.current[page.id] = [];
    }
    updateNotebook((n) => ({
      ...n,
      pages: n.pages.map((p) => (p.id === page.id ? { ...p, elements } : p)),
    }));
  }
  function history(direction) {
    const source = direction === "undo" ? undo : redo,
      target = direction === "undo" ? redo : undo;
    const stack = source.current[page.id] || [];
    if (!stack.length) return;
    target.current[page.id] = [
      ...(target.current[page.id] || []),
      page.elements,
    ];
    changeElements(stack.pop(), false);
  }
  useEffect(() => {
    const handler = (e) => {
      if (
        /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
        e.target.isContentEditable
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        history(e.shiftKey ? "redo" : "undo");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        history("redo");
      } else if (!e.ctrlKey && !e.metaKey) {
        const keys = {
          p: "pen",
          e: "eraser",
          l: "lasso",
          t: "text",
          h: "hand",
        };
        if (keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  function openModal(type) {
    setName(type === "rename" ? nb.name : "");
    setModal(type);
  }
  function submitModal(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (modal === "new")
      setLibrary((s) => libraryReducer(s, { type: "addNotebook", name }));
    if (modal === "folder")
      setLibrary((s) => ({
        ...s,
        folders: [...new Set([...s.folders, name.trim()])],
      }));
    if (modal === "rename")
      updateNotebook((n) => ({ ...n, name: name.trim() }));
    setModal(null);
    setFilter("Notebooks");
  }
  function selectNotebook(n) {
    setLibrary((s) => ({
      ...s,
      activeNotebook: n.id,
      activePage: n.pages[0].id,
    }));
    setSelection(null);
    if (window.innerWidth < 900) setLeft(false);
  }
  function addPage() {
    const p = newPage(page.paper);
    updateNotebook((n) => ({ ...n, pages: [...n.pages, p] }));
    setLibrary((s) => ({ ...s, activePage: p.id }));
  }
  function duplicatePage() {
    const p = { ...structuredClone(page), id: uid() };
    updateNotebook((n) => ({
      ...n,
      pages: [
        ...n.pages.slice(0, n.pages.indexOf(page) + 1),
        p,
        ...n.pages.slice(n.pages.indexOf(page) + 1),
      ],
    }));
    setLibrary((s) => ({ ...s, activePage: p.id }));
  }
  function deletePage() {
    if (nb.pages.length === 1) {
      setToast("Keep at least one page in your notebook.");
      return;
    }
    const remaining = nb.pages.filter((p) => p.id !== page.id);
    updateNotebook((n) => ({ ...n, pages: remaining }));
    setLibrary((s) => ({ ...s, activePage: remaining[0].id }));
  }
  function movePage(delta) {
    const index = nb.pages.indexOf(page),
      next = index + delta;
    if (next < 0 || next >= nb.pages.length) return;
    const all = [...nb.pages];
    [all[index], all[next]] = [all[next], all[index]];
    updateNotebook((n) => ({ ...n, pages: all }));
  }
  async function ask(text = question) {
    if (!text.trim() || loading) return;
    setAiOpen(true);
    setError("");
    setQuestion("");
    setLoading(true);
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
    setChats((s) => ({
      ...s,
      [page.id]: [...(s[page.id] || []), { role: "user", content: text }],
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const image = await canvas.current.exportImage(false);
      const res = await fetch("/api/tutor", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode,
          image,
          selection: selection?.bounds
            ? {
                x: Math.max(0, (selection.bounds.x / 800) * 1000),
                y: Math.max(0, (selection.bounds.y / 1100) * 1000),
                width:
                  (Math.min(
                    selection.bounds.width,
                    800 - Math.max(0, selection.bounds.x),
                  ) /
                    800) *
                  1000,
                height:
                  (Math.min(
                    selection.bounds.height,
                    1100 - Math.max(0, selection.bounds.y),
                  ) /
                    1100) *
                  1000,
              }
            : null,
          history,
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw Error(
          "Tutor service unavailable: the server returned an unreadable response.",
        );
      }
      if (!res.ok) throw Error(data.error || "The tutor could not respond.");
      if (
        typeof data.reply !== "string" ||
        !Array.isArray(data.annotations) ||
        !Array.isArray(data.practice)
      )
        throw Error("Tutor service unavailable: invalid response format.");
      setChats((s) => ({
        ...s,
        [page.id]: [
          ...(s[page.id] || []),
          {
            role: "assistant",
            content: data.reply,
            annotations: data.annotations || [],
            applied: false,
          },
        ],
      }));
      setPractice(data.practice || []);
      setConfigured(true);
    } catch (e) {
      setError(
        e.name === "TimeoutError" || e.name === "AbortError"
          ? "Tutor request timed out. Please try again."
          : e.message,
      );
      setQuestion((current) => current || text);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }
  function applyAnnotations(message) {
    const { elements: annotations, skipped } = placeAnnotations(
      message.annotations,
      page,
    );
    changeElements([...page.elements, ...annotations]);
    setChats((s) => ({
      ...s,
      [page.id]: s[page.id].map((m) =>
        m === message ? { ...m, applied: true } : m,
      ),
    }));
    setToast(
      skipped.length
        ? `${annotations.length} annotations added; ${skipped.length} kept in chat to avoid covering notes.`
        : "Tutor annotations added to a separate layer.",
    );
  }
  function voice() {
    if (!window.isSecureContext) {
      setToast(
        "Voice input requires HTTPS or localhost. You can still type your question over LAN HTTP.",
      );
      return;
    }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setToast("Voice input is not supported in this browser. Try Chrome.");
      return;
    }
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new Speech();
    recognition.current = rec;
    rec.lang = "en-US";
    rec.onresult = (e) => setQuestion(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      setToast(`Microphone: ${e.error}`);
    };
    try {
      rec.start();
      setListening(true);
    } catch (error) {
      setListening(false);
      setToast(`Microphone unavailable: ${error.message}`);
    }
  }
  async function importPDF(event) {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    if (file.size > 40 * 1024 * 1024) {
      setToast("Import failed: PDF must be 40 MB or smaller.");
      return;
    }
    const targetNotebookId = nb.id;
    let documentTask;
    setBusy(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      documentTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
      const doc = await documentTask.promise;
      if (doc.numPages > 60)
        throw Error("Please import a PDF with 60 pages or fewer.");
      const imported = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const source = await doc.getPage(i),
          viewport = source.getViewport({
            scale: Math.min(
              1.35,
              1600 /
                Math.max(
                  source.getViewport({ scale: 1 }).width,
                  source.getViewport({ scale: 1 }).height,
                ),
            ),
          }),
          c = document.createElement("canvas");
        c.width = viewport.width;
        c.height = viewport.height;
        await source.render({ canvasContext: c.getContext("2d"), viewport })
          .promise;
        imported.push({
          ...newPage("blank"),
          background: c.toDataURL("image/jpeg", 0.85),
        });
      }
      setLibrary((s) => ({
        ...s,
        notebooks: s.notebooks.map((n) =>
          n.id === targetNotebookId
            ? { ...n, pages: [...n.pages, ...imported], updated: Date.now() }
            : n,
        ),
        activePage:
          s.activeNotebook === targetNotebookId ? imported[0].id : s.activePage,
      }));
      setToast(`Imported ${imported.length} PDF pages.`);
    } catch (e) {
      setToast(`Import failed: ${e.message}`);
    } finally {
      await documentTask?.destroy().catch(() => {});
      setBusy(false);
      event.target.value = "";
    }
  }
  async function exportPDF() {
    setBusy(true);
    try {
      const { exportPages } = await import("./pdf.js");
      await exportPages(nb.pages, nb.name);
      setToast("Notebook exported as PDF.");
    } catch (e) {
      setToast(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  const filtered = library.notebooks
    .filter((n) => (filter === "Trash" ? n.deleted : !n.deleted))
    .filter((n) =>
      filter === "Favorites"
        ? n.favorite
        : filter.startsWith("folder:")
          ? n.folder === filter.slice(7)
          : filter === "Shared"
            ? false
            : true,
    )
    .filter((n) => n.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div
      className={`app ${left ? "" : "hide-library"} ${pagesOpen ? "" : "hide-pages"} ${aiOpen ? "" : "hide-ai"}`}
    >
      <aside className="library-panel">
        <div className="brand">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span>
            folio<span className="brand-dot">.</span>
          </span>
          <IconButton
            icon={PanelLeft}
            label="Collapse library"
            onClick={() => setLeft(false)}
          />
        </div>
        <div className="workspace-label">
          YOUR WORKSPACE{" "}
          <span>
            Personal <ChevronDown size={12} />
          </span>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search notebooks"
            placeholder="Search anything"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
        <nav>
          {[
            [BookOpen, "Notebooks"],
            [Star, "Favorites"],
            [Users, "Shared"],
            [Trash2, "Trash"],
          ].map(([Icon, label]) => (
            <button
              key={label}
              className={`nav-item ${filter === label ? "selected" : ""}`}
              onClick={() => setFilter(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "Notebooks" && (
                <small>
                  {library.notebooks.filter((n) => !n.deleted).length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="section-label">
          MY NOTEBOOKS
          <IconButton
            icon={Plus}
            label="New notebook"
            onClick={() => openModal("new")}
          />
        </div>
        <div className="notebooks-list">
          {filtered.map((n) => (
            <button
              key={n.id}
              className={`notebook-item ${n.id === nb.id ? "selected" : ""}`}
              onClick={() => selectNotebook(n)}
            >
              <span className="book-cover" style={{ "--book": n.color }}>
                <span />
              </span>
              <span>
                {n.name}
                <small>
                  {n.pages.length} {n.pages.length === 1 ? "page" : "pages"}
                </small>
              </span>
              {n.favorite && <Star size={12} className="tiny-star" />}
            </button>
          ))}
          {!filtered.length && (
            <p className="empty-small">
              {filter === "Shared"
                ? "Shared notebooks need a collaboration service. Your local notes stay private."
                : "No notebooks here yet."}
            </p>
          )}
        </div>
        <div className="section-label">
          FOLDERS
          <IconButton
            icon={Plus}
            label="Create folder"
            onClick={() => openModal("folder")}
          />
        </div>
        {library.folders.map((f) => (
          <button
            key={f}
            className={`folder-item ${filter === `folder:${f}` ? "selected" : ""}`}
            onClick={() => setFilter(`folder:${f}`)}
          >
            <Folder size={17} />
            <span>{f}</span>
            <ChevronRight size={13} />
          </button>
        ))}
        <div className="library-bottom">
          <button className="new-notebook" onClick={() => openModal("new")}>
            <Plus size={18} />
            New notebook
          </button>
          <div className="profile">
            <span className="avatar">Y</span>
            <span>
              Your workspace<small>Stored on this device</small>
            </span>
            <IconButton
              icon={theme === "light" ? Moon : Sun}
              label="Toggle dark mode"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
          </div>
        </div>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          {!left && (
            <IconButton
              icon={PanelLeft}
              label="Open library"
              onClick={() => setLeft(true)}
            />
          )}
          <span className="breadcrumb-muted">My notebooks</span>
          <ChevronRight size={14} />
          <span
            className="notebook-title"
            onDoubleClick={() => openModal("rename")}
          >
            {nb.name}
          </span>
          <button
            className={`favorite-button ${nb.favorite ? "is-favorite" : ""}`}
            title="Toggle favorite"
            onClick={() =>
              updateNotebook((n) => ({ ...n, favorite: !n.favorite }))
            }
          >
            <Star size={17} />
          </button>
        </div>
        <div className="header-right">
          <span className="save-status">
            <span />
            {saveStatus}
          </span>
          <IconButton
            icon={Upload}
            label="Import PDF"
            onClick={() => fileInput.current.click()}
            disabled={busy}
          />
          <IconButton
            icon={Download}
            label="Export notebook as PDF"
            onClick={exportPDF}
            disabled={busy}
          />
          <button
            className={`tutor-toggle ${aiOpen ? "on" : ""}`}
            onClick={() => setAiOpen(!aiOpen)}
          >
            <Sparkles size={16} />
            AI Tutor
          </button>
        </div>
      </header>
      <div className="toolbar">
        <div className="history-tools">
          <IconButton
            icon={Undo2}
            label="Undo"
            onClick={() => history("undo")}
          />
          <IconButton
            icon={Redo2}
            label="Redo"
            onClick={() => history("redo")}
          />
        </div>
        <span className="tool-divider" />
        <div className="writing-tools">
          {tools.map(([value, Icon, label]) => (
            <IconButton
              key={value}
              icon={Icon}
              label={label}
              active={tool === value}
              onClick={() => setTool(value)}
            />
          ))}
        </div>
        <span className="tool-divider" />
        <div className="ink-colors">
          {["#285799", "#222b38", "#ce7181", "#8057ba", "#5b967d"].map((c) => (
            <button
              key={c}
              title={`Ink ${c}`}
              aria-label={`Ink ${c}`}
              onClick={() => setColor(c)}
              className={`color-dot ${color === c ? "chosen" : ""}`}
              style={{ "--ink": c }}
            />
          ))}
          <label className="custom-color" title="Custom ink color">
            <input
              type="color"
              aria-label="Custom ink color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <label className="thickness" title="Pen thickness">
          <span style={{ height: Math.max(2, thickness) }} />
          <input
            type="range"
            aria-label="Pen thickness"
            min="1"
            max="14"
            step=".5"
            value={thickness}
            onChange={(e) => setThickness(+e.target.value)}
          />
        </label>
        <div className="toolbar-end">
          <select
            aria-label="Paper style"
            value={page.paper}
            onChange={(e) =>
              updateNotebook((n) => ({
                ...n,
                pages: n.pages.map((p) =>
                  p.id === page.id ? { ...p, paper: e.target.value } : p,
                ),
              }))
            }
          >
            <option value="grid">Grid paper</option>
            <option value="lined">Lined paper</option>
            <option value="dotted">Dotted paper</option>
            <option value="blank">Blank paper</option>
          </select>
          <IconButton
            icon={Layers}
            label="Toggle page panel"
            active={pagesOpen}
            onClick={() => setPagesOpen(!pagesOpen)}
          />
        </div>
      </div>
      <aside className="pages-panel">
        <div className="pages-heading">
          Pages <span>{nb.pages.length}</span>
          <IconButton icon={Plus} label="Add page" onClick={addPage} />
        </div>
        <div className="page-list">
          {nb.pages.map((p, i) => (
            <button
              key={p.id}
              className={`page-thumb ${p.id === page.id ? "current" : ""}`}
              onClick={() => {
                setLibrary((s) => ({ ...s, activePage: p.id }));
                setSelection(null);
              }}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData("text/plain");
                if (!nb.pages.some((x) => x.id === from)) return;
                const all = nb.pages.filter((x) => x.id !== from);
                all.splice(
                  i,
                  0,
                  nb.pages.find((x) => x.id === from),
                );
                updateNotebook((n) => ({ ...n, pages: all }));
              }}
            >
              <div className={`mini-paper ${p.paper}`}>
                {p.background ? (
                  <img src={p.background} />
                ) : (
                  <svg viewBox="0 0 800 1100">
                    {p.elements
                      .filter((e) => e.type === "text")
                      .map((e) => (
                        <text
                          key={e.id}
                          x={e.x}
                          y={e.y}
                          fill={e.color}
                          fontSize={e.size || 24}
                        >
                          {e.text.split("\n")[0]}
                        </text>
                      ))}
                    {p.elements
                      .filter((e) => e.type === "stroke")
                      .slice(0, 15)
                      .map((e) => (
                        <polyline
                          key={e.id}
                          points={e.points
                            .map((p) => p.slice(0, 2).join(","))
                            .join(" ")}
                          fill="none"
                          stroke={e.color}
                          strokeWidth={e.width}
                        />
                      ))}
                  </svg>
                )}
              </div>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="page-actions">
          <IconButton
            icon={Copy}
            label="Duplicate page"
            onClick={duplicatePage}
          />
          <IconButton
            icon={ArrowUp}
            label="Move page up"
            onClick={() => movePage(-1)}
          />
          <IconButton
            icon={ArrowDown}
            label="Move page down"
            onClick={() => movePage(1)}
          />
          <IconButton icon={Trash2} label="Delete page" onClick={deletePage} />
        </div>
      </aside>
      <main className="canvas-area">
        <div className="canvas-topline">
          <span>
            {nb.name} <span>/</span> Page {nb.pages.indexOf(page) + 1}
          </span>
          <button
            onClick={() => {
              setLeft(false);
              setPagesOpen(false);
              setAiOpen(false);
            }}
            title="Focus mode"
          >
            <Maximize2 size={14} />
            Focus
          </button>
        </div>
        <div className="canvas-scroll">
          <NotebookCanvas
            ref={canvas}
            page={page}
            onChange={changeElements}
            tool={tool}
            color={color}
            thickness={thickness}
            zoom={zoom}
            onSelection={(value) =>
              setSelection(value?.ids?.length && value.bounds ? value : null)
            }
            onAskAI={() => {
              setAiOpen(true);
              setQuestion("Help me understand the selected work.");
            }}
          />
        </div>
        <div className="canvas-bottom">
          <button
            className="page-toggle"
            onClick={() => setPagesOpen(!pagesOpen)}
          >
            <Layers size={15} />
            {nb.pages.indexOf(page) + 1} / {nb.pages.length}
          </button>
          <div className="zoom-control">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            >
              −
            </button>
            <button
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={() => setZoom(0.78)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            >
              +
            </button>
          </div>
          <button className="floating-ai" onClick={() => setAiOpen(!aiOpen)}>
            <Sparkles size={17} />
            Ask AI
          </button>
        </div>
      </main>
      <aside className="ai-panel">
        <div className="ai-heading">
          <span className="ai-icon">
            <Sparkles size={19} />
          </span>
          <div>
            AI Tutor<small>A little guidance, a lot of possibility</small>
          </div>
          <IconButton
            icon={ChevronsRight}
            label="Collapse AI tutor"
            onClick={() => setAiOpen(false)}
          />
        </div>
        <div className="ai-tabs">
          {["Chat", "On Page", "Practice"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "Chat" ? (
                <MessageCircle size={14} />
              ) : t === "On Page" ? (
                <PenLine size={14} />
              ) : (
                <GraduationCap size={15} />
              )}{" "}
              {t}
            </button>
          ))}
        </div>
        <div className="mode-select">
          <span>LEARNING MODE</span>
          <select
            aria-label="Learning mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {[
              "Guided Learning",
              "Hints",
              "Detailed Explanation",
              "Full Solution",
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="ai-content">
          {tab === "Chat" ? (
            <>
              {messages.length === 0 && (
                <div className="tutor-welcome">
                  <span className="welcome-spark">
                    <Sparkles size={25} />
                  </span>
                  <h2>
                    A fresh perspective
                    <br />
                    on your thinking.
                  </h2>
                  <p>
                    Work through the tricky parts, one
                    <br />
                    small discovery at a time.
                  </p>
                  <div className="context-pill">
                    <FileText size={13} />
                    Looking at page {nb.pages.indexOf(page) + 1}
                    {selection ? " · selection active" : ""}
                    <span />
                  </div>
                  <div className="welcome-divider" />
                  <h3>Where would you like to start?</h3>
                  <div className="quick-actions">
                    {[
                      ["Check my work", Check],
                      ["Explain this", Lightbulb],
                      ["Give me a hint", MessageCircle],
                      ["Solve step by step", Layers],
                    ].map(([label, Icon]) => (
                      <button
                        key={label}
                        disabled={loading}
                        onClick={() => ask(label)}
                      >
                        <Icon size={16} />
                        {label}
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                  <p className="selection-tip">
                    <Scan size={16} />
                    Select part of your notes for a more focused conversation.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <div className="message-label">
                    {m.role === "assistant" ? (
                      <>
                        <Sparkles size={13} />
                        YOUR TUTOR
                      </>
                    ) : (
                      "YOU"
                    )}
                  </div>
                  <p>{m.content}</p>
                  {m.annotations?.length > 0 && (
                    <button
                      className="show-on-page"
                      disabled={m.applied}
                      onClick={() => applyAnnotations(m)}
                    >
                      <PenLine size={15} />
                      {m.applied ? "Added to your page" : "Show on Page"}
                    </button>
                  )}
                </div>
              ))}
              {loading && (
                <div className="thinking">
                  <Sparkles size={15} />
                  <span>Reading your notes…</span>
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {error && (
                <div className="ai-error" role="alert">
                  <strong>Tutor unavailable</strong>
                  <p>{error}</p>
                  <button onClick={() => setModal("setup")}>
                    Connection setup
                  </button>
                </div>
              )}
              <div ref={chatEnd} />
            </>
          ) : tab === "On Page" ? (
            <div className="annotation-panel">
              <h3>Your tutor’s ink</h3>
              <p>
                AI annotations live on a separate layer. You can undo them or
                use the lasso to edit them.
              </p>
              <span className="annotation-count">
                {page.elements.filter((e) => e.ai).length} annotations on this
                page
              </span>
              <button
                className="secondary-button"
                disabled={!page.elements.some((e) => e.ai)}
                onClick={() =>
                  changeElements(page.elements.filter((e) => !e.ai))
                }
              >
                <Trash2 size={15} />
                Remove AI annotations
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setTab("Chat");
                  ask(
                    "Explain the current work and suggest helpful annotations in empty space.",
                  );
                }}
              >
                <Sparkles size={15} />
                Explain on this page
              </button>
            </div>
          ) : (
            <div className="annotation-panel">
              <h3>A little practice goes a long way.</h3>
              <p>Get problems tailored to the work on this page.</p>
              {practice.map((p, i) => (
                <div className="practice-problem" key={i}>
                  <small>PROBLEM {i + 1}</small>
                  <p>{p}</p>
                  <button
                    onClick={() => {
                      const result = placePractice([p], page);
                      if (result.elements.length)
                        changeElements([...page.elements, ...result.elements]);
                      setToast(
                        result.skipped.length
                          ? "No safe space on this page. Practice remains in the tutor panel."
                          : "Practice problem added to the page.",
                      );
                    }}
                  >
                    Add to page <Plus size={13} />
                  </button>
                </div>
              ))}
              <button
                className="primary-ai"
                disabled={loading}
                onClick={() =>
                  ask(
                    "Generate 3 practice problems based on my mistakes and the notes on this page.",
                  )
                }
              >
                <Sparkles size={16} />
                {loading ? "Generating…" : "Generate practice"}
              </button>
            </div>
          )}
        </div>
        <div className="ai-compose">
          <div className="question-box">
            <textarea
              aria-label="Question for tutor"
              placeholder="Ask about your notes…"
              rows="2"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <div>
              <span>
                <span className="page-context-dot" />
                Current page{selection ? " + selection" : ""}
              </span>
              <IconButton
                icon={Mic}
                label={listening ? "Stop voice question" : "Voice question"}
                active={listening}
                onClick={voice}
              />
              <button
                className="send-button"
                aria-label="Send question"
                disabled={!question.trim() || loading}
                onClick={() => ask()}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          <button
            className="connection-status"
            onClick={() => setModal("setup")}
          >
            <span className={configured ? "connected" : ""} />
            {configured
              ? "Connected · Notes are sent only when you ask"
              : "Connect your AI · Your notes stay local"}
            <Settings size={12} />
          </button>
        </div>
      </aside>
      <input
        type="file"
        accept="application/pdf"
        ref={fileInput}
        hidden
        onChange={importPDF}
      />
      {busy && (
        <div className="busy-banner">
          <span className="spinner" />
          Processing notebook…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={X}
              label="Close dialog"
              onClick={() => setModal(null)}
            />
            {["new", "folder", "rename"].includes(modal) ? (
              <form onSubmit={submitModal}>
                <span className="modal-symbol">
                  <BookOpen />
                </span>
                <h2>
                  {modal === "new"
                    ? "A new place to think."
                    : modal === "folder"
                      ? "Keep things together."
                      : "Rename notebook"}
                </h2>
                <p>
                  {modal === "folder"
                    ? "Give your folder a name."
                    : "Every good idea starts with a blank page."}
                </p>
                <label>
                  {modal === "folder" ? "Folder name" : "Notebook name"}
                  <input
                    aria-label={
                      modal === "folder" ? "Folder name" : "Notebook name"
                    }
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                </label>
                <button className="primary-button" type="submit">
                  {modal === "new"
                    ? "Create notebook"
                    : modal === "folder"
                      ? "Create folder"
                      : "Save name"}
                </button>
              </form>
            ) : modal === "setup" ? (
              <>
                <span className="modal-symbol purple">
                  <Sparkles />
                </span>
                <h2>Bring your tutor along.</h2>
                <p>
                  The tutor uses a real vision-capable AI model to read your
                  page. No simulated answers.
                </p>
                <ol>
                  <li>
                    Copy <code>.env.example</code> to <code>.env</code> in the
                    project folder.
                  </li>
                  <li>
                    Set <code>OPENAI_API_KEY</code> and an optional compatible
                    base URL and model.
                  </li>
                  <li>
                    Run <code>npm run server</code> and refresh this page.
                  </li>
                </ol>
                <p className="privacy-note">
                  Keys stay on your local server, never in browser storage. Page
                  images are sent to your chosen provider only when you ask.
                </p>
              </>
            ) : (
              <>
                <h2>Notebook options</h2>
                <div className="notebook-options">
                  <button onClick={() => openModal("rename")}>
                    <PenLine size={17} />
                    Rename notebook
                  </button>
                  <label>
                    Move to folder
                    <select
                      value={nb.folder || ""}
                      onChange={(e) =>
                        updateNotebook((n) => ({
                          ...n,
                          folder: e.target.value,
                        }))
                      }
                    >
                      <option value="">No folder</option>
                      {library.folders.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      updateNotebook((n) => ({ ...n, deleted: !n.deleted }));
                      setModal(null);
                      setToast(
                        nb.deleted
                          ? "Notebook restored."
                          : "Notebook moved to trash.",
                      );
                    }}
                  >
                    <Trash2 size={17} />
                    {nb.deleted ? "Restore notebook" : "Move to trash"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button
        className="notebook-menu"
        title="Notebook options"
        aria-label="Notebook options"
        onClick={() => setModal("options")}
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
