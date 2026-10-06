# Flipp — Client-Side PDF Engineering Toolkit

> **Privacy-first, zero-server PDF processing running entirely inside the browser.**
> No uploads. No backend servers. No data retention. Complete client-side security.

---

## 📌 Executive Overview

**Flipp** is an open-source, zero-server PDF and document processing engine. Unlike traditional online PDF services that transfer sensitive user documents to remote cloud infrastructure for server-side manipulation, Flipp executes all PDF operations **100% locally** within the user's browser environment using modern WebAssembly, Canvas API, Web Workers, and client-side JavaScript engines.

Whether merging confidential legal contracts, split-extracting financial statements, applying digital watermarks, or performing optical character recognition (OCR), user files never leave the local device.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Traditional PDF Services:   User File ──► Network Upload ──► Server ──► Download│
│ Flipp Architecture:         User File ─────────────► Browser JS/WASM ─────────►│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Why Flipp? (The Architectural Shift)

### The Problem with Cloud PDF Processing
Most web-based PDF converters operate on a standard request-response model:
1. **Network Overhead & Latency**: Multi-megabyte PDF files must be uploaded over network links to a server.
2. **Privacy & Security Vulnerabilities**: Transmitting sensitive files (tax forms, medical records, identity documents) exposes data to server logs, intermediary proxy retention, potential data breaches, and regulatory compliance risks (GDPR, HIPAA).
3. **Server Infrastructure Cost & Rate Limits**: Cloud hosting, queue management, worker provisioning, and disk cleanup routines require continuous server maintenance and force platforms to enforce paywalls, queuing, or daily page limits.

### Flipp's Solution: Local-First Computing
Flipp eliminates the backend server entirely for document processing:
- **Zero Network Transmission**: File buffers are loaded from local disk storage into browser V8 memory via HTML5 File and Blob APIs.
- **Sub-Second Execution**: Processing runs directly on host system hardware using local CPU cores and GPU-accelerated standard browser APIs.
- **Infinite Scalability at Zero Cost**: Computing cost scales with the user's client hardware. Because no cloud processing servers are involved, Flipp provides unlimited usage without artificial quotas or subscriptions.
- **Offline Reliability**: Once static application assets are cached by the browser, Flipp continues to function without an active internet connection.

---

## 🛠️ Product Capabilities & Tool Matrix

Flipp provides **16 specialized tools** organized across four core functional domains:

| Category | Tool | Description | Underlying Engine / Technology |
| :--- | :--- | :--- | :--- |
| **Edit & Annotate** | **Edit PDF** | Draw, add text, inject shapes, overlay images, and annotate pages interactively | PDF.js rendering + Canvas 2D layer + `pdf-lib` vector re-export |
| | **Sign PDF** | Apply drawn, uploaded, or typed visual signatures with drag & resize overlays | HTML5 Canvas + `pdf-lib` image embedding |
| | **Add Watermark** | Stamp customizable text or image watermarks across pages with opacity and angle controls | `pdf-lib` graphics context & page iteration |
| | **Add Page Numbers** | Stamp formatted page numbers with position, offset, and font size options | `pdf-lib` text layout engine + width caching |
| **Organize & Structure** | **Merge PDF** | Combine multiple PDF files into a unified document in custom order | `pdf-lib` document loading & page copying |
| | **Split PDF** | Extract page ranges into individual PDF documents or downloadable ZIP archives | `pdf-lib` page extraction + `JSZip` bundling |
| | **Delete PDF Pages** | Visually preview pages, select unwanted pages, and recompile clean PDF | `pdfjs-dist` thumbnail rendering + `pdf-lib` page removal |
| | **Rearrange PDF** | Drag-and-drop page reordering with deletion and page rotation | `pdfjs-dist` canvas previews + `pdf-lib` page reindexing |
| **Convert & Extract** | **PDF to Word** | Convert PDF pages into editable `.docx` documents with column/list layout detection | `pdfjs-dist` text item extraction + Tesseract OCR + `docx` generation |
| | **PDF to PNG** | Render PDF pages into high-DPI PNG image files at 1x, 2x, or 3x resolution | `pdfjs-dist` canvas rendering + `JSZip` export |
| | **Images to PDF** | Combine JPEG, PNG, or WebP images into standardized A4 / Letter PDF files | `pdf-lib` image embedding & dimensional page calculation |
| | **Text to PDF** | Convert plain text or text files into formatted multi-page PDF documents | `jsPDF` document layout stream |
| | **PDF to Text** | Extract plain text content or execute OCR on scanned multi-page documents | `pdfjs-dist` text content streams + Tesseract.js WebAssembly OCR |
| **Optimize & Security**| **Compress PDF** | Reduce PDF file sizes via structure optimization or worker-batched image rasterization | `pdf-lib` object stripping OR `pdfjs-dist` worker pool + `jsPDF` JPEG re-assembly |
| | **Protect PDF** | Password-encrypt PDF files with 128-bit AES encryption to restrict opening | `pdfjs-dist` page rendering + `jsPDF` encryption engine |
| | **Unlock PDF** | Remove owner restrictions or open passwords from encrypted PDF files | `pdf-lib` decryption loader (`ignoreEncryption`) |

---

## 🏗️ System Architecture & Data Flow

Flipp is built as a static, modular client-side architecture without framework runtime overhead.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER ENVIRONMENT                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    UI & INTERACTION LAYER (HTML/CSS)                  │  │
│  │    Candy Brutalism Design System • Drop Zones • Interactive Overlays   │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
│                                     │ Event Handlers & File Selection       │
│                                     ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     SHARED UTILITIES & TOOL MODULES                   │  │
│  │  drag-drop.js • page-delete-undo.js • header-nav.js • scroll-reveal.js │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
│                                     │ ArrayBuffer / Blob / Canvas Stream    │
│                                     ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       CLIENT-SIDE ENGINE LAYER                        │  │
│  │                                                                       │  │
│  │   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐   ┌───────┐   │  │
│  │   │  pdfjs-dist  │   │   pdf-lib    │   │    jsPDF    │   │ JSZip │   │  │
│  │   │  (PDF.js)    │   │  (PDF-Lib)   │   │             │   │       │   │  │
│  │   └──────────────┘   └──────────────┘   └─────────────┘   └───────┘   │  │
│  │   Parsing & Canvas   Vector Structure   PDF Raster        Archive     │  │
│  │   Rendering Engine    Manipulation       Assembly         Bundling    │  │
│  │                                                                       │  │
│  │                   ┌──────────────────────────────┐                    │  │
│  │                   │ Tesseract.js (WASM OCR Engine)│                    │  │
│  │                   └──────────────────────────────┘                    │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
│                                     │ Generated Blob / File Stream          │
│                                     ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   BROWSER FILE & DOWNLOAD HANDLER                     │  │
│  │      URL.createObjectURL() ──► Anchor Download ──► Memory Cleanup     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 File Processing Pipelines

Depending on the operation, Flipp routes documents through one of four primary execution pipelines:

### 1. Vector Manipulation Pipeline (e.g., Merge, Split, Rearrange, Watermark, Page Numbers)
*Preserves native vector typography, text selection, and sharp quality without quality loss.*

```
Input PDF File
   │
   ▼
FileReader API (readAsArrayBuffer)
   │
   ▼
PDFLib.PDFDocument.load(buffer)
   │
   ▼
Document Modification (copyPages / addPage / drawText / drawImage)
   │
   ▼
PDFLib.PDFDocument.save() ──► Uint8Array
   │
   ▼
Blob([buffer], { type: 'application/pdf' }) ──► Browser Download
```

### 2. Canvas Rasterization Pipeline (e.g., PDF to PNG, PDF Previews)
*Renders PDF page vector streams into pixel buffers for display or image export.*

```
Input PDF File ──► pdfjsLib.getDocument({ data: arrayBuffer })
   │
   ▼
Page Extraction (doc.getPage(pageNum))
   │
   ▼
Viewport Calculation (page.getViewport({ scale }))
   │
   ▼
HTML5 Canvas Context Rendering (page.render({ canvasContext, viewport }))
   │
   ▼
Canvas Blob Generation (canvas.toDataURL / canvas.toBlob) ──► Download / ZIP Export
```

### 3. Worker-Batched Compression & Encryption Pipeline (e.g., Compress PDF, Protect PDF)
*Processes multi-page raster re-encoding through parallel worker pools with memory cleanup.*

```
Input PDF File
   │
   ▼
Worker Pool Concurrency Allocator (mapConcurrent / workerIndex)
   │
   ▼
Canvas Rendering @ 1.5x Resolution ──► Canvas Pool Reuse
   │
   ▼
JPEG Image Encoding (canvas.toDataURL('image/jpeg', quality))
   │
   ▼
jsPDF Document Assembly (doc.addImage + optional AES Encryption)
   │
   ▼
Canvas Dimension Cleanup (canvas.width = 0; canvas.height = 0) ──► PDF Blob Export
```

### 4. Optical Character Recognition (OCR) Pipeline (e.g., PDF to Text, PDF to Word)
*Extracts text streams or falls back to WebAssembly-powered OCR for scanned documents.*

```
Input PDF Page
   │
   ▼
Attempt Native Text Stream Extraction (page.getTextContent())
   │
   ├─► Native Text Found ──────► Parse Text Coordinates & Line Layout
   │
   └─► Scanned Page / No Text ─► Render Page to HTMLCanvasElement
                                        │
                                        ▼
                                  Tesseract.js WASM Worker Pool
                                  (worker.recognize(canvas))
                                        │
                                        ▼
                                  Recognized Text & Bounding Boxes
```

---

## 🔬 Technology Stack & Client Dependencies

Flipp uses zero server-side frameworks or Node.js runtime environments for production serving. All processing libraries are executed directly inside the user agent.

| Library / Engine | Source / CDN | Role in Flipp Architecture |
| :--- | :--- | :--- |
| **`pdf-lib`** | npm / CDN (`PDFLib`) | Core vector PDF document loader, merger, splitter, page editor, and structure modifier. |
| **`pdfjs-dist`** | Mozilla CDN (`pdfjsLib`) | High-fidelity PDF rendering engine. Parses raw PDF streams and draws page contents onto HTML5 Canvas. |
| **`jsPDF`** | CDN (`jspdf.jsPDF`) | Client-side PDF generation engine. Assembles converted text/image documents and manages local 128-bit AES PDF encryption. |
| **`Tesseract.js`** | CDN (`Tesseract`) | Pure JavaScript & WebAssembly port of the Tesseract OCR engine for client-side text recognition in scanned PDFs. |
| **`JSZip`** | CDN (`JSZip`) | In-memory ZIP archive creator for multi-page image exports and bulk split PDF downloads. |
| **`Clean-CSS`** | npm devDependency (`clean-css-cli`) | Production CSS minifier for optimizing the Candy Brutalism design system stylesheet. |

---

## 📐 Architectural Design Decisions & Trade-offs

### 1. In-Browser Execution vs. Cloud Compute Offloading
- **Decision**: Perform all file processing locally inside the client's browser V8 engine instead of sending files to a microservice backend.
- **Why**: Eliminates server infrastructure costs, eliminates legal liability associated with handling confidential documents, and provides total privacy.
- **Trade-off**: Heavy tasks (e.g., compressing a 500-page PDF or running OCR on a high-resolution scan) utilize the user's host CPU and RAM rather than remote cloud CPU clusters. Extremely large documents may be constrained by mobile browser RAM limits.

### 2. Canvas Image Re-Encoding for PDF Protection & Maximum Compression
- **Decision**: Rasterize PDF pages onto dynamic Canvas contexts and re-encode them via `jsPDF` for maximum compression and password protection.
- **Why**: Standard client-side JS libraries like `pdf-lib` do not support save-time encrypted document serialization. Re-encoding pages as optimized JPEG streams allows Flipp to enforce AES protection and shrink image-heavy PDFs entirely in-browser.
- **Trade-off**: PDF page rasterization flattens vector text into images, rendering text non-selectable in the encrypted/compressed output file.

### 3. Modular Vanilla JavaScript over Heavy SPA Frameworks
- **Decision**: Build Flipp using standard HTML5 static pages and modular ES/Vanilla JavaScript scripts without React, Vue, or Angular framework runtimes.
- **Why**: Zero framework bundle download size, instant First Contentful Paint (FCP), zero DOM reconciliation overhead, and long-term codebase stability without package deprecation.
- **Trade-off**: Requires explicit DOM state handling and manual event listener management across tool components.

---

## 🔒 Privacy Model & Technical Safeguards

Flipp's privacy model is backed by technical guarantees:

1. **Zero Outbound Data Transmission**: No network requests containing user file data, filenames, or extracted text are ever initiated.
2. **Immediate Memory Disposal**:
   - Canvas pixel backing stores are explicitly cleared by setting `canvas.width = 0; canvas.height = 0` inside `finally` blocks to release system RAM/GPU VRAM immediately after conversion.
   - Generated Object URLs (`URL.createObjectURL`) are revoked after download triggers to prevent memory leaks during long browsing sessions.
3. **Input Path-Traversal Sanitization**: Output filenames derived from user inputs undergo string sanitization (`safeName.replace(/[\\/]/g, "_")`) to prevent invalid file paths during browser download generation.
4. **Hardened HTTP Response Headers**: Configured via Cloudflare `_headers` at the edge:
   ```http
   X-Content-Type-Options: nosniff
   X-Frame-Options: SAMEORIGIN
   Referrer-Policy: strict-origin-when-cross-origin
   ```

---

## ⚡ Performance Engineering

Flipp incorporates low-level optimizations to maintain smooth 60fps UI performance and fast conversion speeds:

- **Canvas Memory Disposal**: Modern mobile browsers limit canvas backing store memory. Flipp explicitly resets canvas dimensions (`canvas.width = 0; canvas.height = 0`) immediately after extracting Base64 or Blob data.
- **Worker Pool Concurrency**: Heavy rasterization loops (e.g., Maximum PDF Compression) utilize a concurrent execution worker pool (`mapConcurrent` with limit 5) to process page batches across hardware CPU threads without freezing the main UI thread.
- **Main Thread Event Loop Yielding**: Processing pipelines periodically yield the event loop via `await new Promise(resolve => setTimeout(resolve, 0))` every 5 processed pages, allowing browser rendering frames and user cancellation clicks to be handled smoothly.
- **Direct Canvas Object Passing for OCR**: In `pdf-to-text.js` and `pdf-to-word.js`, Tesseract OCR receives the live `HTMLCanvasElement` directly (`worker.recognize(canvas)`) instead of allocating multi-megabyte Base64 PNG data strings.
- **Fontkit Measurement Caching**: In `pdf-page-numbers.js`, font width evaluations (`font.widthOfTextAtSize`) are memoized in a local `Map` cache to avoid re-parsing font structures for repetitive page number strings across hundreds of pages.
- **Hoisted Regex & Color Allocations**: Regex patterns and `pdfLib.rgb` color allocations are hoisted to module scope or memoized in Map caches to eliminate garbage collection pauses during export generation.

---

## 🌐 SEO, Pre-Rendering & AI Discoverability

Flipp maintains high search engine visibility and LLM crawler discoverability through static architecture:

- **Pre-Rendered HTML**: Every tool landing page (`/tools/<tool-name>/index.html`) is fully pre-rendered static HTML with SEO-optimized titles, meta descriptions, canonical tags, and OpenGraph metadata.
- **Structured JSON-LD Data**: Pages embed Schema.org `WebApplication`, `SoftwareApplication`, `Organization`, and `FAQPage` JSON-LD schemas.
- **Edge Routing Redirects**: Legacy tool URLs and blog paths are seamlessly mapped to current canonical endpoints via 301 server-side redirects in Cloudflare `_redirects`.
- **LLM Indexing Support**:
  - `llms.txt`: Standardized human- and AI-readable project manifest summarizing system architecture, tools, and privacy model.
  - `ai-plugin.json`: Plugin manifest enabling AI agent integrations.

---

## 📂 Codebase Directory Structure

```text
flipp/
├── index.html                    # Root landing page (Hero, tools shortcuts, trust marquee)
├── 404.html                      # Custom static 404 error page
├── package.json                  # Project metadata, dependencies, and minification scripts
├── pnpm-lock.yaml                # Lockfile for reproducible development builds
├── _headers                      # Cloudflare Pages edge security & cache headers
├── _redirects                    # Cloudflare Pages server-side 301 HTTP redirects
├── .cloudflareignore             # Deployment exclusion rules (excludes test runner & binaries)
├── ai-plugin.json                # AI plugin manifest
├── llms.txt                      # Machine-readable architecture summary for LLM crawlers
├── sitemap.xml                   # Search engine index map for main tools & pages
├── sitemap-blog.xml              # Search engine index map for blog educational content
├── robots.txt                    # Web crawler directive file
├── LICENSE                       # MIT License file
├── css/
│   ├── styles.src.css            # Unminified source stylesheet (Candy Brutalism design system)
│   ├── styles.css                # Minified production CSS generated via clean-css
│   ├── animations.css            # Keyframe animation library
│   └── fonts.css                 # Typography font face declarations
├── js/                           # Core client-side execution modules
│   ├── drag-drop.js              # Shared drag-and-drop dropzone & toast notification manager
│   ├── page-delete-undo.js       # Page deletion, particle animation & undo state manager
│   ├── pdf-editor.js             # Interactive PDF annotation & canvas editing engine
│   ├── pdf-compress.js           # Multi-mode PDF compression & worker pool allocator
│   ├── pdf-merge.js              # PDF merge logic
│   ├── pdf-split.js              # PDF page extraction & ZIP archive generator
│   ├── pdf-protect.js            # PDF password encryption module
│   ├── unlock-pdf.js             # PDF decryption module
│   ├── pdf-page-numbers.js       # PDF page numbering stamp engine
│   ├── pdf-to-img.js             # PDF → PNG canvas rendering engine
│   ├── img-to-pdf.js             # Images → PDF document assembly engine
│   ├── text-to-pdf.js            # Plain text → PDF document stream builder
│   ├── pdf-to-text.js            # PDF text stream parser & Tesseract.js OCR engine
│   ├── pdf-to-word.js            # PDF → Word (.docx) column/list layout detector & generator
│   ├── add-watermark.js          # Text & image watermark rendering engine
│   ├── sign-pdf.js               # Digital signature canvas & overlay engine
│   ├── delete-pdf-pages.js       # Interactive page deletion thumbnail engine
│   ├── rearrange-pdf.js          # Drag-and-drop page reordering thumbnail engine
│   ├── header-nav.js             # Navigation bar interactivity controller
│   ├── scroll-reveal.js          # IntersectionObserver scroll reveal controller
│   └── faq.js                    # FAQ accordion interaction logic
├── tools/                        # Dedicated tool landing pages
│   ├── index.html                # Tools hub directory
│   ├── edit-pdf/index.html
│   ├── pdf-to-word/index.html
│   ├── pdf-to-png/index.html
│   ├── images-to-pdf/index.html
│   ├── merge-pdf/index.html
│   ├── split-pdf/index.html
│   ├── compress-pdf/index.html
│   ├── protect-pdf/index.html
│   ├── unlock-pdf/index.html
│   ├── add-page-numbers/index.html
│   ├── text-to-pdf/index.html
│   ├── pdf-to-text/index.html
│   ├── delete-pdf-pages/index.html
│   ├── rearrange-pdf/index.html
│   ├── add-watermark/index.html
│   └── sign-pdf/index.html
├── blog/                         # Static educational articles & landing pages
├── about/                        # About page
├── privacy-policy/               # Technical privacy policy
├── assets/                       # Static visual icons, illustrations, and images
├── docs/                         # Internal architectural audit documentation
└── tests/                        # Isolated Node.js test suites
```

---

## 💻 Development Workflow

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **pnpm**: Recommended package manager (or `npm`)

### Installation
Clone the repository and install devDependencies:
```bash
git clone https://github.com/unfollowaman/flipp.git
cd flipp
pnpm install
```

### Minifying Production CSS
The repository maintains an unminified source CSS file (`css/styles.src.css`) and generates production-ready CSS (`css/styles.css`) using `clean-css-cli`:
```bash
pnpm run minify:css
```

### Local Development Server
Because Flipp requires no server-side build step, you can serve the repository root using any static HTTP server (such as `npx serve`, `python3 -m http.server`, or VS Code Live Server):
```bash
npx serve .
```
Navigate to `http://localhost:3000` in your web browser.

---

## 🧪 Testing Strategy

Flipp utilizes **Node.js's native test runner** (`node --test`) to execute unit and integration tests across JavaScript execution modules.

### Running Tests
To run the full unit test suite:
```bash
node --test
```

### Test Sandbox Architecture
Because Flipp modules run in the browser and interact with DOM elements (`HTMLCanvasElement`, `FileReader`, `URL`, `document`), the test suite in `tests/` constructs isolated evaluation sandboxes using Node.js's `vm` / `new Function()` capabilities. Test mocks simulate:
- Browser DOM elements (`document.createElement`, `canvas.getContext("2d")`)
- `PDFLib`, `pdfjsLib`, `jspdf`, `JSZip`, and `Tesseract` global objects
- Mouse, touch, drag, and file selection event handlers

This guarantees complete test isolation and deterministic execution across tool business logic without requiring heavy browser automation binaries in CI.

---

## 🚀 Deployment Architecture

Flipp is natively deployed to **Cloudflare Pages** via Cloudflare's Git integration.

- **Zero-Build Output**: Cloudflare Pages serves static files directly from the repository root `/`.
- **Ignore Configuration**: The `.cloudflareignore` file prevents test suites and local binaries from being uploaded to Cloudflare's static edge assets, keeping bundle sizes minimal.
- **Server-Side Redirects**: Server-side 301 HTTP redirects are declared in `_redirects` to route legacy paths (e.g., `/compress-pdf/*` ──► `/tools/compress-pdf/`).
- **Edge Cache Headers**: Caching policies for CSS, JS, and image assets are configured in `_headers`.

---

## 📄 License

Flipp is open-source software licensed under the **[MIT License](LICENSE)**.
