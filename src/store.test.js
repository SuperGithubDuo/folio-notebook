import { describe, it, expect } from "vitest";
import { createLibrary, libraryReducer } from "./store.js";
describe("notebook library", () => {
  it("creates a notebook with a usable first page", () => {
    const state = createLibrary();
    const next = libraryReducer(state, {
      type: "addNotebook",
      name: "Calculus",
    });
    expect(next.notebooks.at(-1).name).toBe("Calculus");
    expect(next.notebooks.at(-1).pages).toHaveLength(1);
    expect(next.activeNotebook).toBe(next.notebooks.at(-1).id);
  });
});
