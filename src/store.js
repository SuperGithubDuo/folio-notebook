import { uid } from "./ids.js";
export { uid } from "./ids.js";
export function newPage(paper = "grid") {
  return { id: uid(), paper, elements: [] };
}
const text = (x, y, value, size = 25, color = "#285799") => ({
  id: uid(),
  type: "text",
  x,
  y,
  text: value,
  size,
  color,
});
export function createLibrary() {
  const first = newPage();
  first.elements = [
    text(64, 74, "Quadratic Equations", 38),
    text(66, 122, "Monday, October 26  •  Algebra II", 18, "#8090a6"),
    {
      id: uid(),
      type: "stroke",
      points: [
        [65, 145, 0.5],
        [430, 145, 0.5],
      ],
      color: "#8baed9",
      width: 2,
    },
    text(64, 191, "1. Solve by factoring", 27),
    text(90, 244, "x² + 5x + 6 = 0", 30),
    text(90, 295, "(x + 2)(x + 3) = 0", 30),
    text(90, 350, "x = 2  or  x = 3", 30),
    text(65, 423, "Remember the zero-product property!", 20, "#7d8798"),
    text(64, 503, "2. Find the vertex", 27),
    text(90, 555, "y = x² − 4x + 1", 29),
    text(90, 613, "x = −b / 2a = 4 / 2 = 2", 26),
    text(90, 667, "y = 2² − 4(2) + 1 = −3", 26),
    text(90, 724, "Vertex: (2, −3)", 28),
    {
      id: uid(),
      type: "stroke",
      points: [
        [90, 738, 0.5],
        [300, 738, 0.5],
      ],
      color: "#d88ca3",
      width: 5,
    },
    text(68, 844, "A small sign can make a big difference.", 22, "#7f91a9"),
  ];
  const nb = {
    id: uid(),
    name: "Math Notes",
    color: "#74a1da",
    folder: "School",
    favorite: true,
    deleted: false,
    pages: [first, newPage("lined"), newPage("dotted")],
    updated: Date.now(),
  };
  return {
    version: 1,
    notebooks: [
      nb,
      {
        id: uid(),
        name: "Physics",
        color: "#b9a5d8",
        folder: "School",
        pages: [newPage("grid")],
        updated: Date.now(),
      },
      {
        id: uid(),
        name: "Chemistry",
        color: "#9cb9a5",
        folder: "School",
        pages: [newPage("lined")],
        updated: Date.now(),
      },
      {
        id: uid(),
        name: "Ideas & sketches",
        color: "#d2b18c",
        folder: "Personal",
        pages: [newPage("blank")],
        updated: Date.now(),
      },
    ],
    folders: ["School", "Personal"],
    activeNotebook: nb.id,
    activePage: first.id,
  };
}
export function libraryReducer(state, action) {
  if (action.type === "addNotebook") {
    const page = newPage();
    const nb = {
      id: uid(),
      name: action.name.trim() || "Untitled notebook",
      color: action.color || "#74a1da",
      folder: action.folder || "",
      pages: [page],
      updated: Date.now(),
    };
    return {
      ...state,
      notebooks: [...state.notebooks, nb],
      activeNotebook: nb.id,
      activePage: page.id,
    };
  }
  return state;
}
