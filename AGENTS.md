# AGENTS.md — Flipp Agent Operating Guidelines & Technical Specification

This document is the authoritative, project-specific instruction manual for AI coding agents working on **Flipp**. Every rule, architecture pattern, design token, memory lifecycle requirement, and testing convention in this document applies directly to the Flipp codebase.

---

## 1. Project Mission & Architectural Invariants

**Flipp** is a free, privacy-first, zero-server PDF and document engineering toolkit running 100% locally inside the user's web browser.

### Non-Negotiable Invariants

1. **Absolute Zero-Server Processing**:
   - Never add server-side endpoints, serverless/cloud functions, or external APIs that receive user files, file metadata, or extracted text.
   - All parsing, vector manipulation, rasterization, OCR, compression, encryption, and document assembly must execute client-side in browser memory.
2. **Zero Framework Overhead**:
   - Flipp is a static, frameworkless web application. Do not introduce React, Vue, Next.js, Angular, Svelte, or SPA routers.
   - Each tool is an independent, pre-rendered static HTML file (`tools/<tool-name>/index.html`) backed by a dedicated ES6 module (`js/<tool-name>.js`).
3. **Volatile In-Memory Lifecycle**:
   - Never persist user document data to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
   - Files exist exclusively in volatile RAM (`ArrayBuffer`, `Uint8Array`, `Blob`) during active user sessions and are discarded on navigation or reset.
4. **Zero Analytics & Telemetry**:
   - No tracking pixels, Google Analytics, or third-party telemetry scripts may be added.

---

## 2. Repository Layout & File Responsibilities

```text
flipp/
├── index.html                    # Root landing page (Hero, tool cards, trust marquee)
├── 404.html                      # Static 404 error page
├── package.json                  # Scripts & devDependencies (clean-css-cli, playwright)
├── package-lock.json / pnpm-lock # Lockfiles
├── _headers                      # Cloudflare Pages edge security headers & cache policies
├── _redirects                    # Cloudflare Pages edge 301 redirects for legacy URLs
├── .cloudflareignore             # Cloudflare build asset exclusions (node_modules, tests, .git)
│
├── .jules/                       # Specialized architectural knowledge base
│   ├── bolt.md                   # Performance optimizations, buffer safety, & memory cleanup rules
│   └── palette.md                # Accessibility rules (ARIA live regions, role sync, focus states)
│
├── css/                          # Candy Brutalism design system
│   ├── styles.src.css            # SOURCE OF TRUTH stylesheet (all edits go here)
│   ├── styles.css                # Minified production stylesheet (compiled via clean-css-cli)
│   ├── animations.css            # Floating badge & keyframe animations
│   ├── card-reveal.css           # Scroll unfold keyframe animations
│   └── fonts.css                 # Local typography font face declarations (Poppins)
│
├── js/                           # Client-side execution modules
│   ├── drag-drop.js              # Shared dropzones, toast alerts, progress bars, download triggers
│   ├── page-delete-undo.js       # Disintegration particle animations, undo history, live region
│   ├── header-nav.js             # Dynamic navbar alternative tool shortcut generator
│   ├── faq.js                    # Accessible FAQ accordion interaction controller
│   ├── scroll-reveal.js          # IntersectionObserver scroll reveal controller
│   ├── card-reveal.js            # Staggered card unfold animation controller
│   ├── pdf-editor.js             # WYSIWYG canvas annotator & vector editing engine
│   ├── pdf-to-img.js             # PDF → PNG/JPG multi-DPI canvas rasterizer
│   ├── img-to-pdf.js             # Image → PDF multi-page builder with drag-reordering
│   ├── pdf-merge.js              # PDF & image merger with interactive SVG connectors
│   ├── pdf-split.js              # Range and N-page chunk document splitter
│   ├── pdf-compress.js           # Multi-mode compressor (Vector Structural vs. Lossy JPEG Raster)
│   ├── pdf-protect.js            # In-browser 128-bit AES password encryption module
│   ├── unlock-pdf.js             # Password & owner restriction removal engine
│   ├── pdf-page-numbers.js       # Customizable page numbering stamp engine
│   ├── pdf-to-text.js            # Text stream parser & Tesseract OCR fallback
│   ├── pdf-to-word.js            # Layout-reconstructing PDF → DOCX generator
│   ├── add-watermark.js          # Interactive draggable/resizable text & image watermarking
│   ├── sign-pdf.js               # Visual signature pad, image upload, & typed signature overlay
│   ├── delete-pdf-pages.js       # Visual thumbnail deletion tool with particle undo
│   ├── rearrange-pdf.js          # Drag-and-drop page reindexing & rotation tool
│   └── text-to-pdf.js            # Plain text → PDF document stream builder
│
├── tools/                        # Pre-rendered static landing pages (16 tools)
│   ├── index.html                # Tool directory hub
│   └── <tool-name>/index.html    # Dedicated tool page
│
├── blog/                         # Static SEO articles on browser security & document tech
├── docs/                         # Internal audit knowledge base & UX polish logs
└── tests/                        # Node.js native test runner suites & Playwright benchmarks
```

---

## 3. The 16 Tools & Core Processing Engines

Production libraries are loaded over CDN (`cdnjs.cloudflare.com` / `cdn.jsdelivr.net`) using Subresource Integrity (SRI) hashes:

| Tool | Endpoint | Primary Engine | Pipeline Architecture |
| :--- | :--- | :--- | :--- |
| **Merge PDF** | `/tools/merge-pdf/` | `pdf-lib` + `pdfjs-dist` | In-memory AST merging; copies pages via `copyPages`; preserves vector text; renders interactive SVG bezier connector lines. |
| **Split PDF** | `/tools/split-pdf/` | `pdf-lib` + `pdfjs-dist` + `JSZip` | Range mode & N-page chunks; debounced preview renders (120ms); extracts sub-documents as Blobs or ZIP. |
| **Delete PDF Pages** | `/tools/delete-pdf-pages/` | `pdfjs-dist` + `pdf-lib` | Visual thumbnail deletion with multi-step particle disintegration undo; extracts remaining page indices. |
| **Rearrange PDF** | `/tools/rearrange-pdf/` | `pdfjs-dist` + `pdf-lib` | Touch and mouse drag-and-drop page reindexing and 90-degree page rotation; recompiles page order via `pdf-lib`. |
| **PDF to PNG** | `/tools/pdf-to-png/` | `pdfjs-dist` + `JSZip` | Multi-DPI canvas rasterization (1x, 2x, 3x); worker pool (`MAX_CONCURRENT = 3`); exports individual PNG/JPG or packaged ZIP. |
| **Images to PDF** | `/tools/images-to-pdf/` | `jsPDF` + `createImageBitmap` | Batched conversion (groups of 5); auto or standardized A4/Letter dimensions; thread yielding preserves 60fps UI. |
| **PDF to Word** | `/tools/pdf-to-word/` | `pdfjs-dist` + `docx` + `Tesseract.js` | Parses text item coordinate streams; reconstructs line groups and headings; exports native `.docx` OpenXML archive. |
| **PDF to Text** | `/tools/pdf-to-text/` | `pdfjs-dist` + `Tesseract.js` | Extracts text stream; validates character quality heuristics; automatically triggers WASM OCR fallback if scanned. |
| **Text to PDF** | `/tools/text-to-pdf/` | `jsPDF` + Canvas 2D | Renders text lines to canvas with custom fonts; compiles multi-page PDF document with vector page numbering. |
| **Edit PDF** | `/tools/edit-pdf/` | `pdfjs-dist` + Canvas 2D + `pdf-lib` | Interactive canvas annotations, vector shapes, text overlays, and freehand drawing baked into output PDF. |
| **Sign PDF** | `/tools/sign-pdf/` | `SignaturePad` + `pdf-lib` | Captures digital signature via smooth bezier canvas, image file, or typed font; embeds signature PNG into PDF pages. |
| **Add Watermark** | `/tools/add-watermark/` | `pdf-lib` + Canvas 2D | Interactive draggable and resizable text or image watermark; hoists configuration across multi-page document loops. |
| **Add Page Numbers** | `/tools/add-page-numbers/` | `pdf-lib` + `fontkit` | Embeds custom TTF/WOFF fonts; calculates text widths; applies customizable numbering stamps across all pages. |
| **Compress PDF** | `/tools/compress-pdf/` | `pdf-lib` (lossless) OR `pdfjs-dist` + `jsPDF` (lossy) | **Recommended**: Lossless metadata stripping & object stream compression. **Maximum**: Lossy 70% JPEG rasterization via canvas pool. |
| **Protect PDF** | `/tools/protect-pdf/` | `pdfjs-dist` + `jsPDF` | In-browser 128-bit AES password encryption; renders high-DPI canvases pre-filled with `#ffffff` and encrypts via `jsPDF`. |
| **Unlock PDF** | `/tools/unlock-pdf/` | `pdf-lib` | Strips owner permissions or prompts for open password; decrypts and rebuilds 100% vector-preserving clean PDF. |

---

## 4. Memory Management & Performance Protocols

Document processing in browser tabs operates under strict RAM and GPU constraints. Follow these protocols from [.jules/bolt.md](file:///e:/Antigravity/Projects/flipp/.jules/bolt.md):

### 1. Canvas Backing Store Deallocation
- Simply detaching a `<canvas>` element from the DOM (`container.innerHTML = ""`) leaves its backing bitmap in GPU memory until garbage collection.
- **Rule**: Explicitly zero canvas dimensions before detaching or clearing containers:
  ```javascript
  canvas.width = 0;
  canvas.height = 0;
  ```

### 2. PDF.js Lifecycle Cleanup
- PDF.js retains fonts, streams, and render contexts in memory.
- **Rule**: Always call `page.cleanup()` in a `try...finally` block inside page loops:
  ```javascript
  try {
    await page.render({ canvasContext, viewport }).promise;
  } finally {
    page.cleanup();
  }
  ```
- **Rule**: Always call `await pdfDoc.destroy()` in top-level `finally` blocks when operations complete or error out.

### 3. ArrayBuffer Transfer & Detachment Safety
- Passing an `ArrayBuffer` to `pdfjsLib.getDocument({ data: arrayBuffer })` detaches the buffer in the main thread because worker tasks transfer ownership.
- **Rule**: If the buffer must subsequently be loaded by `pdf-lib` (or reused by another tool action), pass a cloned slice:
  ```javascript
  const pdfJsData = arrayBuffer.slice(0);
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfJsData }).promise;
  // original arrayBuffer remains valid for PDFLib.PDFDocument.load(arrayBuffer)
  ```

### 4. Zero-Allocation Processing in Loops
- **Regular Expressions**: Never instantiate `new RegExp()` or regex literals inside item iteration loops. Hoist them to module scope.
- **Whitespace Checks**: Use `!/\S/.test(str)` instead of `!str.trim()` or `str.trim().length === 0` to eliminate intermediate string allocations.
- **Color Objects**: Cache `pdfLib.rgb(r, g, b)` objects in a `Map` or hoist constants outside page iteration loops.
- **Font Widths**: Cache `font.widthOfTextAtSize(text, fontSize)` measurements in a local `Map` keyed by `${text}_${fontSize}`.

### 5. UI Thread Yielding & Responsiveness
- For multi-page batch operations (e.g., rendering 50+ pages or rasterizing images), yield thread execution to allow the browser to paint progress bars and process user input:
  ```javascript
  if (pageIndex % 5 === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  ```

### 6. Object URL Lifecycle
- Revoke generated Blob URLs immediately after anchor dispatch or within a 100ms timeout:
  ```javascript
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  ```

---

## 5. UI/UX Design System: "Candy Brutalism"

Flipp's visual identity merges high-contrast neo-brutalist construction with cheerful, tactile pastel and primary accents.

### 1. Stylesheet Workflow (STRICT RULE)
- **SOURCE OF TRUTH**: Always edit `css/styles.src.css`.
- **NEVER EDIT** `css/styles.css` directly!
- After editing `css/styles.src.css`, compile the minified stylesheet:
  ```bash
  pnpm run minify:css
  ```

### 2. Design Tokens
```css
/* Color Palette */
--yellow:     #f5e642;   /* Primary accent, dropzone active */
--sky-blue:   #6dc8f3;   /* Secondary accent */
--pink:       #f075c2;   /* Tertiary accent */
--mint:       #3dd68c;   /* Success states & highlights */
--amber:      #f5a623;   /* Warning states */
--red:        #e8302a;   /* Danger states & deletions */
--cream:      #fafae8;   /* Card backgrounds & neutral tint */
--black:      #0d0d0d;   /* High-contrast ink & borders */
--white:      #ffffff;   /* Pure white */
--line:       #dcdcd4;   /* Subtle divider lines */

/* Borders & Shadows */
--border-std:   2px solid #0d0d0d;
--border-input: 2.5px solid #0d0d0d;
--shadow-hard:  4px 4px 0px #0d0d0d;
--shadow-hover: 6px 6px 0px #0d0d0d;

/* Corner Radii */
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-xl: 24px;

/* Typography */
font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, sans-serif;
letter-spacing: -0.03em;
```

### 3. Tactile Micro-Interactions
- **Buttons (`.cta-btn`)**:
  - Base: `border: var(--border-std); box-shadow: 3px 3px 0px var(--black)`.
  - Hover: `transform: translateY(-2px); box-shadow: 5px 5px 0px var(--black)`.
  - Active: `transform: translate(2px, 2px); box-shadow: 0 0 0` (simulates physical mechanical click).
- **Drop Zones (`.drop-zone`)**:
  - Base: 3px offset shadow.
  - Hover: 6px offset shadow with `--yellow` background.
  - Dragover: 8px offset shadow with solid black border.
- **Option Pills (`.opt-pill`)**:
  - High-contrast toggle buttons; active pill takes black background with white text; hover shows yellow accent.

---

## 6. Accessibility & ARIA Synchronization

Follow these accessibility patterns established in [.jules/palette.md](file:///e:/Antigravity/Projects/flipp/.jules/palette.md):

1. **Focus States**: High-contrast outline on `:focus-visible`:
   ```css
   :focus-visible {
     outline: 3px solid var(--black);
     outline-offset: 2px;
   }
   ```
2. **Mode Switchers & Pill Groups**:
   - Parent container must use `role="radiogroup"` and a descriptive `aria-label`.
   - Option pill buttons must use `role="radio"` with `aria-checked="true"` (or `"false"`), synchronized via `activatePill()`.
3. **Toolbars & Formatting Toggles**:
   - Container has `role="toolbar"` and `aria-label`.
   - Toggle buttons must keep `aria-pressed="true"` / `"false"` in sync with the `.active` CSS class.
4. **FAQ Accordions (`js/faq.js`)**:
   - Trigger buttons must include `aria-expanded="false"` / `"true"` and `aria-controls="panel-id"`.
   - Panels must have matching `id` and `role="region"`.
5. **Live Region Announcements**:
   - Status updates, file deletions, and undo restorations must be announced to assistive tech via `#flipp-live-region`:
     ```javascript
     const liveRegion = document.getElementById("flipp-live-region");
     if (liveRegion) liveRegion.textContent = announcementText;
     ```

---

## 7. Development, Build & Testing Commands

### 1. Local Development Server
Serve static files directly (no compile step required for HTML/JS):
```bash
# Using npx serve
npx serve .

# Or using Python 3
python -m http.server 3000
```

### 2. Stylesheet Build
```bash
# Minify css/styles.src.css -> css/styles.css
pnpm run minify:css
```

### 3. Native Node.js Test Suite
Flipp uses Node's built-in test runner (`node:test`) with an in-memory browser DOM simulation sandbox:
```bash
# Run the full test suite (250+ tests across all tools)
node --test tests/*.test.js tests/test_pdf_to_img.js

# Run a specific tool's test suite
node --test tests/unlock-pdf.test.js
node --test tests/pdf-protect.test.js
node --test tests/pdf-split.test.js
```

#### Test Sandbox Conventions
- Tests in `tests/*.test.js` evaluate client scripts inside an isolated Node sandbox using `new Function()`.
- Browser globals (`document`, `HTMLCanvasElement`, `FileReader`, `window.PDFLib`, `window.pdfjsLib`) are mocked in-memory.
- **Rule**: Do not introduce direct `require()` calls to external npm packages that are absent from vanilla environments. Mock dependencies on `global.window` instead.

### 4. Real Browser Benchmarks (Playwright)
```bash
# Run real browser verification & OCR accuracy benchmarks
node tests/run_phase3_real_browser_test.js
```

---

## 8. Deployment & Cloudflare Pages Configuration

- **Platform**: Cloudflare Pages via Git integration.
- **Build Command**: `exit 0` (zero compilation needed; pure static files).
- **Build Output Directory**: `/` (repository root).
- **Environment Variable**:
  - `SKIP_DEPENDENCY_INSTALL = true`: Required. Skips `npm install` on Cloudflare runners to keep assets well below deployment limits.
- **Edge Security & Cache Rules (`_headers`)**:
  - `/js/*` and `/css/styles.css`: `Cache-Control: public, max-age=31536000, immutable`.
  - `*.html` and `/tools/*.html`: `Cache-Control: public, max-age=3600`.
  - Security headers enforced: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Edge 301 Redirects (`_redirects`)**:
  - Redirects legacy paths (e.g. `/merge-pdf/` → `/tools/merge-pdf/`).
  - **Rule**: Never add trailing-slash rewrite rules for the apex domain to avoid infinite redirect loops on Cloudflare edge.

---

## 9. Operating Boundaries for Flipp Development

### What You May Execute Autonomously
- Inspecting and editing code in `js/*.js`, `tools/*/index.html`, and `index.html`.
- Modifying design tokens, layouts, and animations in `css/styles.src.css` and recompiling via `pnpm run minify:css`.
- Adding, updating, and executing unit tests in `tests/*.test.js` using `node --test`.
- Applying memory cleanup optimizations (canvas zeroing, buffer slicing, object URL revocation).
- Enhancing accessibility (ARIA attributes, keyboard navigation, live region feedback).

### What Requires User Sign-off
- Violating the zero-server invariant or introducing any external network transmission.
- Adding new npm production dependencies or CDN script tags without SRI hashes.
- Changing core conversion logic that compromises vector fidelity (e.g., rasterizing vector text).
- Modifying Cloudflare build configuration (`_headers`, `_redirects`, deployment variables).
- Destructive operations on git history or repository assets.
