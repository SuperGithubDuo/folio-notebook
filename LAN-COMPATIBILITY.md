# HTTP LAN compatibility audit

## Root cause and fix

`store.js` called `crypto.randomUUID()` during initial library creation. Browsers hide that method on untrusted HTTP LAN origins, so React failed before rendering. Annotation generation repeated the same assumption; the canvas had a weak `Math.random()` fallback.

`src/ids.js` now supplies all notebook, page, ink, shape, text and AI annotation IDs. It prefers native `randomUUID` with the correct receiver. Otherwise it fills 16 bytes using `getRandomValues` and sets UUID-v4 version/variant bits. This API works in insecure contexts. If both cryptographic methods are absent it fails explicitly, never substitutes weak randomness. Document IDs are not authentication/session tokens.

## Codebase API review

- `randomUUID`: all application call sites consolidated into the feature-detected helper. PDF.js also feature-detects its own use.
- `crypto.subtle`, clipboard, service workers, camera/geolocation, file picker APIs: no application use.
- Speech recognition: optional, checked at invocation; HTTP LAN gives an HTTPS/localhost explanation and synchronous browser permission failures are caught.
- `AbortSignal.timeout`: browser use replaced with AbortController plus a cleared timer for older Safari versions. Server use is Node-only and unrelated to origin security.
- Pointer Events, canvas, SVG, Blob/object URLs, File input/arrayBuffer, Image.decode, document.fonts, localStorage, structuredClone: not secure-context gated. Existing storage-error handling remains intact. Modern Safari is required; this does not promise legacy Safari support.
- No Vite allowed-host wildcard, CORS wildcard, insecure-origin flag, firewall change or API-origin-check relaxation added. `dev:lan` is explicit opt-in; `dev` remains loopback-only. AI API stays bound to loopback with existing origin validation.

## Verification scope

Regression tests check native UUID preference, fallback bits/format, unique library and annotation IDs, fail-closed behavior, optional browser API failures, and real HTTP private-IP contexts without randomUUID. LAN UI tests create a notebook, draw ink, add/navigate pages, reload saved content, and generate an annotation ID. Run profiles include desktop/mobile Chromium and desktop/iPad-profile WebKit on Windows. Physical iPad Safari and Apple Pencil behavior require testing on the user's device. No AI success was simulated or claimed.

HTTP does not encrypt LAN traffic; use trusted HTTPS/authentication for sensitive or remotely exposed deployments. Data is local to each browser and origin, not synchronized between the Windows browser and the iPad.
