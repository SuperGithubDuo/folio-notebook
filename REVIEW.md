# Notebook reliability review

## Verified in Chromium

- Actual mouse ink, pencil and highlighter colors/opacity/thickness; swept stroke erasing and undo.
- Synthetic PointerEvents for stylus zero pressure and final lift coordinates. These do not establish physical iPad palm rejection quality.
- Rectangular lasso move, resize, delete; per-page undo/redo; final pointerup handling without intervening movement.
- Inline text, rectangles/arrows; notebook/page creation, duplicate/delete, last-page protection, button/drag reorder, folders/favorites/search/trash/restore.
- Immediate reload persistence, page style/order restoration; malformed saved structure recovery and blocked/quota-limited storage UI.
- Focus/collapsible panels, zoom reset, hand pan, four paper styles, dark mode and responsive body-width checks.
- Real PDF import, invalid-file errors, export page count/order/distinct background pixels and visible annotation ink. Export uses immutable pages, without navigating the active page or arbitrary delays. Non-portrait backgrounds stay proportional.
- Hand-drawn math strokes captured as PNG in all four tutor-mode requests. Missing credentials return an explicit failure, with no assistant response or AI ink added.
- Invalid gateway responses preserve the question; errors remain scoped to their source page across navigation.

## Changes

- Replaced cancellable delayed saves that lost freshly committed ink on immediate reload.
- Replaced UI-page-switch/90ms export loop with isolated snapshot rendering and image/font readiness.
- Fixed a tutor-image race: the page is now cloned before awaiting fonts, so navigating to another page cannot silently send the wrong handwriting.
- Added collision-aware wrapped text/practice placement; skips explanatory text on unknown PDF backgrounds instead of covering writing. Target circles/highlights intentionally point at content.
- Separated mode-specific backend instructions; retained safe provider error codes, retry hints and useful status distinctions.
- Hardened PDF import size/render limits, worker cleanup and notebook-target handling.
- Preserved UI design/CSS.

## Automated verification

- Frontend Vitest: 26 passed.
- Node backend: 13 passed.
- Playwright Chromium: 27 passed.
- Production build: passed; optional PDF export chunk exceeds the default 500 kB advisory threshold.
- Production dependency audit: zero known vulnerabilities reported.

## Not verified / limitations

No OPENAI_API_KEY is configured. Live handwriting recognition, mathematical correctness, actual mode adherence and model-generated annotation quality were NOT tested. Backend provider fixtures verify contracts/error behavior, not successful real tutoring; the app has no simulated-success fallback. Physical stylus, voice permission/device behavior, Safari/iPadOS and other browser engines remain unverified. Local browser storage is finite; export backups. PDF export remains rasterized; no cloud collaboration or synchronization.
