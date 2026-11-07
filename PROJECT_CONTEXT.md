# Flipp — Project Context & Architectural Documentation

> **Persistent Reference Document for Flipp**  
> *Privacy-first, zero-server PDF and document engineering toolkit running 100% in the browser.*

---

## 1. Project Overview

### 1.1 Mission & Value Proposition
**Flipp** is a free, open-source, client-side PDF and image engineering toolkit. Traditional web-based PDF converters require users to upload confidential documents (such as financial statements, tax records, legal contracts, or medical files) to remote cloud servers for manipulation, exposing data to network interception, proxy retention, server logging, and third-party compliance liabilities.

Flipp eliminates the backend processing server entirely. Every document transformation, parsing step, vector manipulation, image rasterization, OCR operation, and document assembly is executed **100% locally within the user's web browser agent** using WebAssembly, the HTML5 Canvas API, Web Workers, and client-side JavaScript document libraries.

### 1.2 Core Capabilities
Flipp provides **16 specialized document utilities** categorized into four functional domains:

| Category | Tool | Endpoint | Primary Engine |
| :--- | :--- | :--- | :--- |
| **Organize & Structure** | **Merge PDF** | `/tools/merge-pdf/` | `pdf-lib` + `pdfjs-dist` |
| | **Split PDF** | `/tools/split-pdf/` | `pdf-lib` + `pdfjs-dist` + `JSZip` |
| | **Delete PDF Pages** | `/tools/delete-pdf-pages/` | `pdfjs-dist` + `pdf-lib` |
| | **Rearrange PDF** | `/tools/rearrange-pdf/` | `pdfjs-dist` + `pdf-lib` |
| **Convert & Extract** | **PDF to PNG** | `/tools/pdf-to-png/` | `pdfjs-dist` + `JSZip` |
| | **Images to PDF** | `/tools/images-to-pdf/` | `jsPDF` |
| | **PDF to Word** | `/tools/pdf-to-word/` | `pdfjs-dist` + `docx` + `Tesseract.js` |
| | **PDF to Text** | `/tools/pdf-to-text/` | `pdfjs-dist` + `Tesseract.js` (WASM) |
| | **Text to PDF** | `/tools/text-to-pdf/` | `jsPDF` + HTML5 Canvas |
| **Edit & Annotate** | **Edit PDF** | `/tools/edit-pdf/` | `pdfjs-dist` + Canvas 2D + `pdf-lib` |
| | **Sign PDF** | `/tools/sign-pdf/` | `SignaturePad` + `pdf-lib` |
| | **Add Watermark** | `/tools/add-watermark/` | `pdf-lib` + Canvas 2D |
| | **Add Page Numbers** | `/tools/add-page-numbers/` | `pdf-lib` + `fontkit` |
| **Optimize & Security**| **Compress PDF** | `/tools/compress-pdf/` | `pdf-lib` (Lossless) OR `pdfjs-dist` + `jsPDF` (Lossy) |
| | **Protect PDF** | `/tools/protect-pdf/` | `pdfjs-dist` + `jsPDF` (AES-128 Encryption) |
| | **Unlock PDF** | `/tools/unlock-pdf/` | `pdf-lib` |

---

## 2. Architecture & Tech Stack

### 2.1 Architectural Pattern: Frameworkless Local-First Static Architecture
Flipp is architected as a **static, modular, zero-framework web application**:
- **Zero Framework Runtime Overhead**: No React, Vue, Next.js, Angular, or Svelte. HTML files are static and pre-rendered. First Contentful Paint (FCP) is near instantaneous.
- **Independent Sandbox Isolation**: Each tool resides in an isolated HTML file (`/tools/<tool-name>/index.html`) backed by its dedicated JavaScript module (`/js/<tool-name>.js`). An unhandled exception or memory issue in one tool cannot compromise another.
- **Native ES6 Modules**: JavaScript files utilize standard ES6 `import` / `export` syntax, sharing foundational utilities (`drag-drop.js`, `page-delete-undo.js`, `header-nav.js`) while keeping tool business logic encapsulated.

### 2.2 Client-Side Library Ecosystem
Production libraries are loaded over CDN (`cdnjs.cloudflare.com` and `cdn.jsdelivr.net`) using Subresource Integrity (SRI) hashes (`integrity="sha384-..."`):

| Library | Version / Scope | Role in Flipp Architecture |
| :--- | :--- | :--- |
| **`pdf-lib`** | `^1.17.1` (UMD/ESM) | In-memory vector PDF document loader, merger, splitter, page editor, and structure modifier. Modifies raw PDF syntax trees without rasterizing. |
| **`pdfjs-dist`** | `4.3.136` (Mozilla) | PDF parsing and rendering engine. Draws page contents onto HTML5 Canvas viewports and extracts text item coordinate streams. |
| **`jsPDF`** | `2.5.1` (ParallPath) | Client-side PDF generation engine. Assembles converted text/image documents and manages 128-bit AES password encryption. |
| **`JSZip`** | `3.10.1` (Stuk) | In-memory ZIP archive generation for multi-page image exports and bulk split PDF downloads. |
| **`Tesseract.js`** | `5.0.5` | Pure JavaScript & WebAssembly port of the Tesseract OCR engine for scanned document character recognition. |
| **`docx`** | `8.5.0` | In-browser `.docx` OpenXML archive generation from structured text and image runs. |
| **`SignaturePad`** | CDN | HTML5 canvas-based bezier smoothing for drawn digital signatures. |

### 2.3 Package Configuration (`package.json`)
```json
{
  "scripts": {
    "minify:css": "cleancss -O0 css/styles.src.css -o css/styles.css"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1"
  },
  "devDependencies": {
    "clean-css-cli": "^5.6.3",
    "playwright": "^1.61.1"
  }
}
```
- **`clean-css-cli`**: Dev dependency used solely to minify `css/styles.src.css` into `css/styles.css`.
- **`playwright`**: Dev dependency used for automated browser verification, visual regression testing, and OCR benchmark execution across real Chromium instances.

---

## 3. Folder & Directory Structure

```text
flipp/
├── index.html                    # Root landing page (Hero, tools shortcuts, trust marquee)
├── 404.html                      # Custom static 404 error page
├── package.json                  # Dependencies & CSS minification build script
├── package-lock.json             # npm lockfile
├── pnpm-lock.yaml                # pnpm lockfile
├── _headers                      # Cloudflare Pages edge security & cache-control directives
├── _redirects                    # Cloudflare Pages HTTP 301 server-side edge redirects
├── .cloudflareignore             # Cloudflare Pages asset deployment exclusion rules
├── .gitignore                    # Git tracking ignore definitions
├── ai-plugin.json                # OpenAI / AI Agent plugin manifest
├── llms.txt                      # Standardized architecture summary for LLM crawlers
├── sitemap.xml                   # Search engine sitemap for core tools & pages
├── sitemap-blog.xml              # Search engine sitemap for educational blog content
├── robots.txt                    # Search crawler indexing rules
├── LICENSE                       # MIT Open Source License
├── HOSTING.md                    # Cloudflare Pages deployment specification
├── CLOUDFLARE_DEPLOYMENT_AUDIT.md# Deployment troubleshooting & build configuration guide
│
├── .jules/                       # Architectural learning logs & accessibility conventions
│   ├── bolt.md                   # Performance optimizations, buffer handling, & memory cleanup rules
│   └── palette.md                # Accessibility learnings (ARIA roles, live regions, focus sync)
│
├── css/                          # Design system stylesheets
│   ├── styles.src.css            # Unminified source stylesheet (Candy Brutalism design tokens)
│   ├── styles.css                # Production minified stylesheet (generated via clean-css-cli)
│   ├── animations.css            # Keyframe animations (floating icons, pulse, shield movements)
│   ├── card-reveal.css           # Scroll unfold keyframe animations for cards
│   └── fonts.css                 # Local typography font face declarations (Poppins)
│
├── js/                           # Client-side execution modules
│   ├── drag-drop.js              # Shared dropzones, toast alerts, progress bars, download triggers
│   ├── page-delete-undo.js       # Disintegration particle animations, undo history, ARIA live region
│   ├── header-nav.js             # Dynamic navbar tool shortcut generator
│   ├── faq.js                    # Accessible FAQ accordion interaction controller
│   ├── scroll-reveal.js          # IntersectionObserver scroll reveal handler
│   ├── card-reveal.js            # Staggered card unfold animation controller
│   ├── pdf-editor.js             # WYSIWYG canvas annotator & vector editing engine (98 KB)
│   ├── pdf-to-img.js             # PDF → PNG/JPG multi-DPI canvas rasterizer
│   ├── img-to-pdf.js             # Image → PDF multi-page builder with drag-reordering
│   ├── pdf-merge.js              # PDF & image merger with interactive SVG connectors
│   ├── pdf-split.js              # Range and N-page chunk document splitter
│   ├── pdf-compress.js           # Multi-mode compressor (Vector Structural vs. Lossy JPEG Raster)
│   ├── pdf-protect.js            # In-browser 128-bit AES password encryption module
│   ├── unlock-pdf.js             # Password & owner restriction removal engine
│   ├── pdf-page-numbers.js       # Customizable page numbering stamp engine
│   ├── pdf-to-text.js            # Text stream parser & Devanagari-aware Tesseract OCR
│   ├── pdf-to-word.js            # Layout-reconstructing PDF → DOCX generator
│   ├── add-watermark.js          # Interactive draggable/resizable text & image watermarking
│   ├── sign-pdf.js               # Visual signature pad, image upload, & typed signature overlay
│   ├── delete-pdf-pages.js       # Visual thumbnail deletion tool with particle undo
│   ├── rearrange-pdf.js          # Drag-and-drop page reindexing & rotation tool
│   └── text-to-pdf.js            # Plain text → PDF document stream builder
│
├── tools/                        # Pre-rendered SEO landing pages for each tool (16 tools)
│   ├── index.html                # Tool directory hub
│   ├── edit-pdf/index.html
│   ├── pdf-to-png/index.html
│   ├── images-to-pdf/index.html
│   ├── merge-pdf/index.html
│   ├── split-pdf/index.html
│   ├── compress-pdf/index.html
│   ├── protect-pdf/index.html
│   ├── unlock-pdf/index.html
│   ├── pdf-to-word/index.html
│   ├── pdf-to-text/index.html
│   ├── add-watermark/index.html
│   ├── add-page-numbers/index.html
│   ├── delete-pdf-pages/index.html
│   ├── rearrange-pdf/index.html
│   ├── sign-pdf/index.html
│   └── text-to-pdf/index.html
│
├── blog/                         # 11 static SEO articles explaining browser security & PDF tech
├── about/                        # About page & mission overview
├── privacy-policy/               # Technical privacy policy & zero-server disclosures
├── assets/                       # Static icons, logos, brand illustrations, & local fonts
├── docs/                         # Internal audit knowledge base & UX polish logs
└── tests/                        # Node.js native test suite & Playwright benchmark scripts
```

---

## 4. Frontend & Routing

### 4.1 Routing & Navigation Architecture
- **Static File Routing**: Each tool URL maps directly to a static directory containing an `index.html` file (e.g., `https://tryflipp.pages.dev/tools/merge-pdf/`).
- **Edge 301 Redirects (`_redirects`)**: Cloudflare Pages handles legacy URL redirection at the network edge:
  ```apache
  /index.html          /                          301
  /pdf-to-png/         /tools/pdf-to-png/         301
  /merge-pdf/          /tools/merge-pdf/          301
  /split-pdf/          /tools/split-pdf/          301
  /protect-pdf/        /tools/protect-pdf/        301
  /compress-pdf/*      /tools/compress-pdf/       301
  /unlock-pdf          /tools/unlock-pdf/         301
  ```
- **Apex Domain Trailing Slash**: Handled natively by Cloudflare Pages edge routing. Manual trailing-slash rewrite rules for the apex domain are omitted to prevent infinite redirect loops.

### 4.2 Shared Interactive UI Components
1. **Drop Zone Manager (`js/drag-drop.js`)**:
   - `initDropZone(dropZoneEl, fileInputEl, onFiles)`: Manages dragover, dragleave, drop, click-to-browse, and file selection. Automatically detects whether options or previews are visible and performs smooth viewport scrolling (`target.scrollIntoView({ behavior: "smooth" })`).
   - `showToast(message, type)`: Creates temporary sliding status alerts (`toast-success`, `toast-error`).
   - `setProgress(barEl, labelEl, value, label)`: Updates visual progress bars and status labels.
   - `activatePill(group, value)`: Updates `.opt-pill` active states and synchronizes `aria-checked` attributes.
   - `setupDragReorder(card, onReorder)`: Handles dual mouse drag (`dragstart`, `dragover`, `drop`) and touch drag (`touchstart`, `touchmove`, `touchend`) reordering across thumbnail grids.
   - `renderPdfFirstPage(fileOrBuffer)`: Safely clones ArrayBuffers (`buffer.slice(0)`) to render page 1 previews via PDF.js without detaching the caller's buffer.
2. **Page Deletion & Particle Disintegration (`js/page-delete-undo.js`)**:
   - `PageDeleteUndoManager`: Manages a multi-step undo stack for deleted thumbnail cards.
   - Particle Animation: When a page is deleted, generates an overlay canvas rendering 45 bursting particles in neo-brutalist colors.
   - Accessibility: Respects `prefers-reduced-motion` and announces deletions/restorations via a screen reader live region (`#flipp-live-region`).
3. **Dynamic Navigation Toolbar (`js/header-nav.js`)**:
   - Dynamically inspects the current URL path and injects the top 6 alternative tool shortcuts into the navbar, excluding the currently active tool.
4. **Accessible FAQ Accordions (`js/faq.js`)**:
   - Automatically assigns unique IDs and synchronizes `aria-controls` and `aria-expanded` attributes on accordion triggers.

---

## 5. PDF Processing Pipelines & Core Features

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               FLIPP PIPELINES                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Vector Manipulation  : PDF-Lib loads buffer ──► modify AST ──► save Uint8Arr │
│ 2. Canvas Rasterization : PDF.js renders viewport ──► HTML5 Canvas ──► Blob/ZIP │
│ 3. Lossy Re-Assembly    : PDF.js ──► Canvas JPEG ──► jsPDF new document         │
│ 4. Optical Recognition  : PDF.js textStream ──► (heuristic fail) ──► Tesseract  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 The Seven Core PDF Tools

#### 1. PDF to PNG (`js/pdf-to-img.js`)
- **Engine**: `pdfjs-dist` (v4.3.136) + `JSZip` (v3.10.1).
- **Pipeline**:
  1. Reads file into `ArrayBuffer`; loads via `pdfjsLib.getDocument({ data: arrayBuffer })`.
  2. Generates initial thumbnail cards (up to 12 pages) at `scale = 0.3` without allocating base64 strings (`generateDataUrl = false`).
  3. Conversion loop uses concurrency `MAX_CONCURRENT = 3` to render pages onto `<canvas>` contexts at 1x, 2x, or 3x scale.
  4. Supports PNG or JPG (pre-filling `#ffffff` on canvas to prevent black alpha backgrounds in JPEG).
  5. Downloads individual images or packages all pages in-memory into a ZIP archive via `JSZip`.
- **Memory Protocol**: Sets `canvas.width = 0; canvas.height = 0` immediately after extracting image data. Calls `page.cleanup()` in `finally` blocks and `pdfDoc.destroy()` on reset.

#### 2. Images to PDF (`js/img-to-pdf.js`)
- **Engine**: `jsPDF` (v2.5.1) + HTML5 Drag & Drop API + `createImageBitmap`.
- **Pipeline**:
  1. Accepts PNG, JPEG, and WebP files. Displays thumbnails with drag-and-drop reordering.
  2. Inspects natural dimensions via `createImageBitmap(file)` or temporary image elements without base64 decoding.
  3. Batches conversion in groups of 5. Converts images to data URLs on demand and adds pages to `jsPDF` using either `auto` sizing (preserving aspect ratio) or standardized `a4` / `letter` dimensions with centered aspect fit.
  4. Inserts images via `pdf.addImage(dataUrl, format, x, y, w, h, undefined, "FAST")`.
  5. Yields thread control every batch (`setTimeout(0)`) to preserve 60fps UI responsiveness.

#### 3. Merge PDF (`js/pdf-merge.js`)
- **Engine**: `pdf-lib` (v1.17.1) + `pdfjs-dist`.
- **Pipeline**:
  1. Accepts multiple PDFs and standalone images in any combination.
  2. If images (PNG/JPG) are supplied, converts them in-memory to single-page PDFs using `PDFLib.PDFDocument.create()` and `embedPng`/`embedJpg`.
  3. Instantiates output document via `PDFLib.PDFDocument.create()`.
  4. Loads each source document with `{ ignoreEncryption: true }`, executes `outPdf.copyPages(srcPdf, srcPdf.getPageIndices())`, and appends pages with `outPdf.addPage(page)`.
  5. Preserves 100% vector typography, text selection, and sharp fidelity.
  6. Renders an interactive neo-brutalist stage diagram with computed SVG bezier connector lines linking source thumbnails to the master merged document card.

#### 4. Split PDF (`js/pdf-split.js`)
- **Engine**: `pdf-lib` + `pdfjs-dist` + `JSZip`.
- **Pipeline**:
  1. Reads file bytes once into module memory (`originalPdfBytes`).
  2. Debounces inputs (`120ms`) and uses a request sequence map (`activeRenderTasks`) to render live page previews of the chosen boundary pages without race conditions.
  3. Two splitting modes:
     - **Range Mode**: Splits the document into two distinct PDFs: Part 1 (`start` to `end`) and Part 2 (`end + 1` to `totalPages`).
     - **Split Every N Pages**: Iterates in steps of `N`, extracting chunks of pages into individual PDFs.
  4. Pages are cloned via `outPdf.copyPages(srcPdf, pageIndexes)` and serialized to Blobs.
  5. Offers individual downloads or bulk ZIP export via `JSZip`.

#### 5. Compress PDF (`js/pdf-compress.js`)
- **Engine**: `pdf-lib` (Recommended Mode) and `pdfjs-dist` + `jsPDF` (Maximum Mode).
- **Pipeline**:
  - **Recommended Mode (Lossless Structural Optimization)**:
    - Loads PDF via `pdf-lib` with `{ ignoreEncryption: true }`.
    - Clears common metadata fields (`setTitle("")`, `setAuthor("")`, `setSubject("")`, `setKeywords([])`).
    - Serializes output using PDF object streams: `pdfDoc.save({ useObjectStreams: true })`.
    - Preserves 100% vector text quality. If the file is already compact, reports "File is already highly optimized!".
  - **Maximum Mode (Lossy JPEG Rasterization)**:
    - Executes a concurrent worker pool (`mapConcurrent` with limit `5`) using a reusable canvas pool (`canvasPool`).
    - Renders pages via `pdfjsDoc.getPage()` at scale `1.5`.
    - Encodes each canvas to JPEG at 70% quality (`canvas.toDataURL("image/jpeg", 0.7)`).
    - Assembles a new document in `jsPDF` inserting the compressed JPEGs.
    - Yields 40%–80% size reductions on image-heavy documents at the cost of rasterizing vector text.

#### 6. Protect PDF (`js/pdf-protect.js`)
- **Engine**: `pdfjs-dist` + `jsPDF` (128-bit AES Encryption).
- **Pipeline**:
  1. Validates password requirements (minimum 8 characters, confirmation match).
  2. Because `pdf-lib` does not support encrypting documents on save, Flipp renders pages using `pdfjs-dist` onto `<canvas>` contexts at scale `2.0` in batches of 4.
  3. Pre-fills canvas backgrounds with solid white (`#ffffff`).
  4. Encodes canvases to JPEG at 95% quality.
  5. Builds an encrypted PDF in `jsPDF` using:
     ```javascript
     encryption: {
       userPassword: password,
       ownerPassword: password,
       userPermissions: ["print", "modify", "copy", "annot-forms"],
     }
     ```
  6. Successfully enforces 128-bit AES open password protection entirely in the browser, but rasterizes page contents into images.

#### 7. Unlock PDF (`js/unlock-pdf.js`)
- **Engine**: `pdf-lib`.
- **Pipeline**:
  1. Loads document via `PDFDocument.load(bytes, { ignoreEncryption: true })`.
  2. If `!doc.isEncrypted`, alerts user that the file is not protected.
  3. Tests whether an open password is required by loading without `ignoreEncryption`. If an encryption error occurs, prompts the user for the password.
  4. If only owner restrictions (print/copy restrictions) are present, decrypts immediately without prompting.
  5. Decrypts with `password` and `ignoreEncryption: true`.
  6. Creates a new document via `PDFDocument.create()`, copies all pages via `newDoc.copyPages(loadedDoc, loadedDoc.getPageIndices())`, and saves.
  7. **100% vector-preserving**: Unlocked PDF retains crisp typography, selectable text, and form fields.

### 5.2 Download & Memory Management Protocols
- **Sanitized Download Filenames**: User file names are scrubbed using `.replace(/[\\/]/g, "_")` to prevent directory traversal or file download errors.
- **Object URL Revocation**: Generated blob URLs (`URL.createObjectURL(blob)`) are revoked via `URL.revokeObjectURL(url)` immediately after anchor dispatch or within a 100ms timeout.
- **Canvas Backing Store Deallocation**: Canvas elements have their dimensions set to `width = 0; height = 0` immediately after data extraction to release GPU and VRAM allocations.
- **PDF.js Cleanup**: Page rendering loops execute `page.cleanup()` in `finally` blocks, and `await pdfDoc.destroy()` is called upon task completion or error handling.

---

## 6. Privacy & Security Model

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FLIPP SECURITY BOUNDARY                         │
├────────────────────────────────────────────────────────────────────────┤
│ [ User File on Disk ] ──► FileReader API (in-memory ArrayBuffer)       │
│                                │                                       │
│                                ▼                                       │
│         [ V8 Heap / Web Worker / WebAssembly Memory ]                  │
│                                │                                       │
│                                ▼                                       │
│          [ URL.createObjectURL(blob) ──► <a download> ]               │
│                                │                                       │
│                                ▼                                       │
│                [ URL.revokeObjectURL(url) (GC) ]                      │
│                                                                        │
│  ❌ Zero Network Uploads                                               │
│  ❌ Zero Analytics / Telemetry Trackers                                │
│  ❌ Zero Third-Party Document Ingestion                                │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Technical Privacy Guarantees
1. **Zero Outbound File Transmission**: No network requests (`fetch`, `XMLHttpRequest`, `sendBeacon`, or WebSocket) transmit file buffers, file names, or extracted text to remote servers. All operations run in client memory.
2. **Zero Permanent Storage**: Flipp uses no `localStorage`, `sessionStorage`, `IndexedDB`, or cookies for user documents. Files exist solely in volatile RAM during the active session.
3. **Zero Third-Party Trackers**: No Google Analytics, Plausible, PostHog, or tracking pixels exist in the codebase.
4. **Edge Security Headers (`_headers`)**:
   ```http
   X-Content-Type-Options: nosniff
   X-Frame-Options: SAMEORIGIN
   Referrer-Policy: strict-origin-when-cross-origin
   ```

### 6.2 Identified Security & Privacy Considerations
- **Third-Party CDN Requests**: External scripts (`pdf-lib`, `jspdf`, `pdfjs-dist`, `tesseract.js`) are loaded from public CDNs. All CDN script tags include cryptographic SRI hashes (`integrity="sha384-..."`).
- **Google Fonts Requests**: HTML pages connect to `fonts.googleapis.com` and `fonts.gstatic.com` to load the `Bricolage Grotesque` font.
- **Runtime Font Fetch in Page Numbers**: `js/pdf-page-numbers.js` performs a runtime `fetch()` for the IBM Plex Serif `.woff` file from Google Fonts without an offline fallback.
- **Tesseract OCR Language Weights**: When OCR is executed in `pdf-to-text.js` or `pdf-to-word.js`, Tesseract downloads language weights over the network from its CDN.
- **Content Security Policy (CSP)**: `_headers` currently lacks a strict `Content-Security-Policy`. Adding a CSP header would cryptographically enforce Flipp's zero-outbound-network guarantee.

---

## 7. UI & Design System ("Candy Brutalism")

Flipp implements a **Candy Brutalism** design language—merging high-contrast neo-brutalist construction with cheerful, tactile pastel and primary accents.

```
┌────────────────────────────────────────────────────────┐
│                   CANDY BRUTALISM TOKENS               │
├────────────────────────────────────────────────────────┤
│ --yellow:     #f5e642   |   --sky-blue: #6dc8f3        │
│ --pink:       #f075c2   |   --mint:     #3dd68c        │
│ --cream:      #fafae8   |   --black:    #0d0d0d        │
│ --border-std: 2px solid #0d0d0d                        │
│ --shadow-hard: 4px 4px 0px #0d0d0d                     │
└────────────────────────────────────────────────────────┘
```

### 7.1 Design Tokens ([css/styles.src.css](file:///e:/Horizon/flipp/css/styles.src.css))
- **Color Palette**:
  - Accents: `--yellow` (`#f5e642`), `--sky-blue` (`#6dc8f3`), `--pink` (`#f075c2`), `--mint` (`#3dd68c`), `--amber` (`#f5a623`), `--red` (`#e8302a`).
  - Neutrals: `--cream` (`#fafae8`), `--light-blue` (`#d9edf7`), `--line` (`#dcdcd4`), `--black` (`#0d0d0d`), `--white` (`#ffffff`).
- **Borders & Shadows**:
  - Standard Border: `--border-std: 2px solid #0d0d0d` (or `2.5px solid #0d0d0d` on inputs).
  - Hard Shadow: `--shadow-hard: 4px 4px 0px #0d0d0d`.
  - Corner Radii: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-xl: 24px`.
- **Typography**:
  - Display & Body: `"Bricolage Grotesque", sans-serif` with tight tracking (`-0.03em`) and heavy weights (700, 800, 900).
  - Local Fallback: `"Poppins", sans-serif` via `assets/fonts/Poppins-Regular.ttf`.

### 7.2 Tactile Component States
- **Buttons (`.cta-btn`)**:
  - Base: Solid black border with 3px hard offset shadow.
  - Hover: `transform: translateY(-2px)` with expanded 5px offset shadow.
  - Active: `transform: translate(2px, 2px)` with `box-shadow: 0 0 0` (simulates physical button depression).
- **Option Pills (`.opt-pill`)**:
  - High-contrast radiogroup buttons with black active background and yellow hover accents.
- **Drop Zones (`.drop-zone`)**:
  - 3px hard shadow base; expands to 6px shadow with yellow background on hover; 8px shadow with solid black border on dragover.
- **Accessibility & Focus Indicators**:
  - High-contrast `:focus-visible` styling (`3px solid var(--black)` with `outline-offset: 2px`).
  - ARIA role synchronization (`role="toolbar"`, `role="radiogroup"`, `aria-checked`, `aria-expanded`).

---

## 8. Performance & Browser Compatibility

### 8.1 Performance Optimizations
- **No SPA Hydration**: Static pre-rendered HTML delivers near-zero Time to Interactive (TTI).
- **Worker Concurrency**:
  - `pdf-compress.js` processes pages with concurrency `5` via `mapConcurrent()`.
  - `pdf-to-img.js` renders pages across 3 concurrent worker loops.
- **Event Loop Yielding**: CPU-heavy loops yield execution back to the browser every 5 pages via `await new Promise(r => setTimeout(r, 0))` to maintain UI responsiveness and update progress bars.
- **Low-Allocation Grouping**: Hoists RegExp literals and color objects outside iteration loops. Uses `/\S/.test(str)` rather than `str.trim().length > 0` to eliminate intermediate string allocations during document parsing.

### 8.2 Browser Compatibility
- **Desktop**: Fully compatible with evergreen browsers (Chrome, Edge, Firefox, Safari, Brave, Opera).
- **Mobile**: Responsive touch support on iOS Safari and Android Chrome. Touch drag-and-drop reordering is implemented in `js/drag-drop.js`.
- **Memory Boundaries on Mobile**: Processing high-page-count PDFs (100+ pages) at high DPI on mobile devices may encounter browser tab memory ceilings.

---

## 9. Environment Variables

Flipp requires **no secret API keys, database credentials, or server-side environment secrets**.

### 9.1 Cloudflare Pages Build Variables
| Variable Name | Required Value | Purpose |
| :--- | :--- | :--- |
| `SKIP_DEPENDENCY_INSTALL` | `true` | Instructs the Cloudflare Pages build environment to skip `npm install`. Prevents heavy test/development packages in `node_modules` from exceeding Cloudflare's asset size limits. |

---

## 10. Build & Testing Infrastructure

### 10.1 Local Development
Serve the root directory with any static web server:
```bash
# Using npx serve
npx serve .

# Or using Python 3
python -m http.server 3000
```
Open `http://localhost:3000` in your browser.

### 10.2 CSS Minification Build Step
When modifying styles, edit the source file `css/styles.src.css` and recompile:
```bash
# Minify CSS for production
pnpm run minify:css
```

### 10.3 Testing Architecture
Flipp uses **Node.js's native test runner** (`node:test`) with an in-memory browser DOM simulation sandbox:

```bash
# Run the complete test suite
node --test tests/*.test.js tests/test_pdf_to_img.js

# Run a specific tool test suite
node --test tests/pdf-protect.test.js
node --test tests/pdf-split.test.js
```

#### Test Sandbox Conventions
Because Flipp runs in browser environments (`document`, `HTMLCanvasElement`, `FileReader`), tests in `tests/*.test.js` construct isolated execution sandboxes using Node's `new Function()` evaluation:
- Strips ES6 `import` statements using regex.
- Injects mock implementations of `document.getElementById`, `addEventListener`, `classList`, and global libraries (`window.PDFLib`, `window.pdfjsLib`).
- Asserts state transitions, event handling, error handling, and memory cleanup without requiring headless browser binaries in CI.

### 10.4 Real Browser Benchmarks (Playwright)
Playwright is used for visual regression, accessibility verification, and OCR accuracy benchmarking:
```bash
# Install Playwright browser binaries
pnpm exec playwright install chromium

# Run the real browser verification benchmark
node tests/run_phase3_real_browser_test.js
```

---

## 11. Deployment Architecture (Cloudflare Pages)

```
┌────────────────────────────────────────────────────────┐
│               CLOUDFLARE PAGES EDGE SERVING            │
├────────────────────────────────────────────────────────┤
│ Git Push ──► Cloudflare Build Runner                   │
│              ├── Build Command: exit 0                 │
│              ├── SKIP_DEPENDENCY_INSTALL: true         │
│              └── Output Directory: /                   │
│                                                        │
│ Edge Processing:                                       │
│   ├── _headers    ──► 1-year cache on /js/* and CSS    │
│   └── _redirects  ──► 301 redirects for legacy URLs    │
└────────────────────────────────────────────────────────┘
```

- **Hosting Platform**: Cloudflare Pages via Git integration.
- **Build Command**: `exit 0` (zero compilation required).
- **Build Output Directory**: `/` (repository root).
- **Environment Variables**: `SKIP_DEPENDENCY_INSTALL = true`.
- **Exclusion Rules (`.cloudflareignore`)**:
  - `node_modules/`
  - `tests/`
  - `.git/`
- **Edge Caching Rules (`_headers`)**:
  - `Cache-Control: public, max-age=31536000, immutable` for `/css/styles.css` and `/js/*`.
  - `Cache-Control: public, max-age=3600` for `*.html` and `/tools/*.html`.
  - `Cache-Control: public, max-age=2592000` for images, icons, and favicons.

---

## 12. Development Conventions & Guidelines

1. **Zero-Server Processing Invariant**:
   - Never add server-side endpoints, microservices, or cloud functions that receive user document data. All PDF transformations must remain 100% in-browser.
2. **CSS Workflow (Source-of-Truth)**:
   - Always edit [css/styles.src.css](file:///e:/Horizon/flipp/css/styles.src.css).
   - Never edit [css/styles.css](file:///e:/Horizon/flipp/css/styles.css) directly; always compile it via `pnpm run minify:css`.
3. **Memory Cleanup Requirements**:
   - Reset canvas backing stores immediately after use: `canvas.width = 0; canvas.height = 0`.
   - Call `page.cleanup()` inside page iteration loops.
   - Destroy PDF.js document instances via `await pdfDoc.destroy()` in `finally` blocks.
   - Revoke object URLs via `URL.revokeObjectURL(url)`.
4. **Isolated Test Suite Conventions**:
   - Write unit tests in `tests/*.test.js` using Node’s built-in `node:test` runner.
   - Use the `new Function()` sandbox pattern to mock browser globals.
   - Do not add direct `require()` calls to external npm packages in test files unless they are installed and mocked for non-Node environments.
5. **Accessibility Standards**:
   - Ensure interactive controls use `:focus-visible` with high-contrast outlines (`3px solid var(--black)`).
   - Synchronize ARIA states (`aria-checked`, `aria-expanded`, `aria-pressed`) on toggle and mode-switching controls.
   - Announce dynamic page changes using the `#flipp-live-region` polite live region.

---

## 13. Known Issues, Technical Debt & Limitations

### 13.1 High Priority
- **Vector Text Flattening in Password Protection (`js/pdf-protect.js`)**:
  - Because `pdf-lib` does not support save-time encryption, `Protect PDF` rasterizes pages into JPEG canvases before assembling them in `jsPDF`. The resulting PDF is password-protected, but all selectable vector text and hyperlinks are converted into flat images.
- **Vector Text Flattening in Maximum Compression (`js/pdf-compress.js`)**:
  - Maximum compression rasterizes pages to JPEG at 70% quality, stripping selectable vector text.
- **Rasterized Body Text in Text to PDF (`js/text-to-pdf.js`)**:
  - Renders input text onto `<canvas>` and embeds JPEG images into `jsPDF` to apply the custom Poppins font. The exported PDF contains non-selectable body text (while footer page numbers remain vector text).

### 13.2 Medium Priority
- **Hardcoded Hindi OCR Language (`js/pdf-to-text.js`)**:
  - Line 279 hardcodes `createWorker("hin")`. When scanning English or European PDFs, character recognition accuracy drops significantly.
- **Range Split Page Constraint (`js/pdf-split.js`)**:
  - Line 440 strictly requires `end < totalPages` to ensure Part 2 is non-empty. Users cannot extract an arbitrary range ending at the final page without triggering an error.
- **Immutable Edge Caching Without File Hashing (`_headers`)**:
  - `/js/*` and `/css/styles.css` are configured with `max-age=31536000, immutable`. Because HTML files reference scripts without query parameters or content hashes (e.g., `../../js/pdf-split.js`), returning users may receive stale JavaScript from browser or edge caches after an update.

### 13.3 Low Priority
- **Online Network Dependency for Custom Font (`js/pdf-page-numbers.js`)**:
  - Runtime `fetch()` requests IBM Plex Serif from Google Fonts without an offline fallback to standard 14 PDF fonts (e.g., Helvetica).
- **In-Memory Heap Saturation on Large Image Exports (`js/pdf-to-img.js`)**:
  - High-DPI data URLs are accumulated in the `renderedPages` array in JavaScript heap memory, creating memory pressure on mobile devices when converting 100+ page documents.
