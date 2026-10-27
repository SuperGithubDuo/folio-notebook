import { afterEach, describe, it, expect, vi } from "vitest";
import { uid, createLibrary, libraryReducer, newPage } from "./store.js";
import { placeAnnotations } from "./annotations.js";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
afterEach(() => vi.unstubAllGlobals());
describe("IDs on HTTP LAN origins", () => {
  it("prefers the native randomUUID method with its crypto receiver", () => {
    const api = {
      randomUUID() {
        expect(this).toBe(api);
        return "native-uuid";
      },
      getRandomValues: vi.fn(),
    };
    vi.stubGlobal("crypto", api);
    expect(uid()).toBe("native-uuid");
    expect(api.getRandomValues).not.toHaveBeenCalled();
  });
  it("creates RFC 4122 v4 identifiers from secure bytes when randomUUID is unavailable", () => {
    let calls = 0;
    const api = {
      getRandomValues(bytes) {
        expect(this).toBe(api);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(16);
        bytes.fill(255);
        bytes[0] = calls++;
        return bytes;
      },
    };
    vi.stubGlobal("crypto", api);
    const id = uid();
    expect(id).toMatch(UUID);
    expect(id).toBe("00ffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uid()).not.toBe(id);
  });
  it("initial library notebook pages and annotation IDs all work without randomUUID", () => {
    const secure = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: secure.getRandomValues.bind(secure),
    });
    const state = createLibrary();
    const next = libraryReducer(state, {
      type: "addNotebook",
      name: "LAN notes",
    });
    const page = newPage();
    const result = placeAnnotations(
      [
        {
          type: "text",
          x: 100,
          y: 100,
          width: 300,
          height: 60,
          text: "A hint",
          color: "#8057ba",
        },
      ],
      page,
    );
    const ids = [
      ...next.notebooks.flatMap((n) => [
        n.id,
        ...n.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)]),
      ]),
      page.id,
      ...result.elements.map((e) => e.id),
    ];
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.every((id) => UUID.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("fails explicitly rather than using weak randomness if cryptographic APIs are absent", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => uid()).toThrow(/secure random.*unavailable/i);
  });
});
