# Folio notebook

A local-first React notebook inspired by the supplied light, writing-focused reference. Pen input is editable SVG ink, not a static screenshot.

## Run

Requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Start the optional local AI service in another terminal:

```sh
# Copy .env.example to .env; add your own provider credentials there.
npm run server
```

Never put API keys in the browser or commit `.env`. For compatible providers, configure the base URL and a vision-capable model. Your page image, selected region information, and conversation are sent to that provider only when you ask the tutor. There is no canned AI response or offline handwriting recognition.

## Access from an iPad or phone on your LAN

Run `npm run dev:lan` instead of `npm run dev`, then open `http://<computer-LAN-IP>:5173` on a device on the same trusted Wi-Fi. Find the address with Windows `ipconfig`. The normal `dev` command remains localhost-only. Do not enable public port forwarding or disable your firewall; if prompted, allow Node only on your trusted private network.

HTTP LAN origins do not expose `crypto.randomUUID()`. All notebook/page/ink/annotation IDs use one helper that prefers native UUIDs, otherwise uses `crypto.getRandomValues()` with UUID-v4 version/variant bits. No weak random-number fallback is used.

Browser data is per device and origin: localhost notes do not automatically appear on a LAN IP or iPad. Export a backup before changing addresses. HTTP traffic is unencrypted; use trusted HTTPS and authentication for sensitive data or broader access.

Voice input requires HTTPS/localhost and reports this limitation on HTTP LAN. The API remains bound to loopback with its existing localhost-origin checks; LAN AI requests are deliberately not enabled by relaxing those protections. Core notebook work does not require AI. Configure authenticated HTTPS before enabling remote tutoring.

For LAN regression tests, install WebKit (`npx playwright install webkit`) and run `npm run test:lan` while the LAN server is running. Set `FOLIO_LAN_URL=http://<IP>:5173` to select an address; otherwise the tests discover a private IPv4 interface. Tests cover Chromium, mobile Chromium, WebKit and an iPad-sized WebKit profile; this is not a physical iPad test.

## Notebook tools

- Create/rename notebooks, favorites, folders, move to folder, trash and restore.
- Add/duplicate/delete/reorder pages (drag thumbnails or use up/down buttons).
- Pen, pencil, highlighter, stroke eraser, rectangular lasso selection, text, rectangles, ellipses and arrows.
- Select ink to move it, resize using its handle, or ask the tutor about it.
- Undo/redo, zoom, drag-to-pan, grid/lined/dotted/blank paper.
- PDF import renders source pages as backgrounds you can annotate; export rasterizes each page into a PDF.
- Autosave to this browser/device with reload restoration. Export important notes: browser storage can be cleared or fill up, especially with PDFs.
- Separate AI ink with undo and remove-layer action, four learning modes, practice generation, optional browser speech recognition.
- Collapsible panels, focus mode, light/dark UI.

Keyboard: P pen, E eraser, L lasso, T text, H pan, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo. Delete/Backspace deletes selected elements when canvas has focus.

## Tests

```sh
npm run test:unit
node --test server/*.test.js
npx playwright install chromium
npm run test:e2e
npm run build
```

## Boundaries

No real-time sharing or cloud synchronization: the Shared view states this explicitly. Folder assignment is via Notebook options. Erasing removes whole intersected elements rather than splitting strokes. Lasso is a rectangular region. PDF backgrounds preserve their source aspect ratio within the portrait notebook page. PDF text is rasterized in export, not searchable. Explanatory AI text is wrapped and relocated to avoid known ink; on imported PDF/image pages it stays in the tutor panel when background occupancy is unknown. Target circles and translucent highlights may intentionally overlap the referenced work. Voice support and stylus pressure/palm behavior depend on browser/device support. The backend is local-only; deploy behind authentication, HTTPS, rate limits and durable storage before exposing it publicly. AI answers and placement can be wrong; review them before adding to your notes. Live AI recognition cannot be verified without provider credentials.
