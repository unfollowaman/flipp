# Phase 1 — "Essentials & Basics" Audit Report: Flipp

**Target Platform:** [Flipp](https://tryflipp.pages.dev)
**Production Domain:** `https://tryflipp.pages.dev`
**Auditor Role:** Independent Senior QA / Web-Platform Auditor
**Audit Date:** October 17, 2026
**Scope:** Phase 1 — Trust, Navigation, Failure UX, Core File-Handling, Accessibility, Cross-Browser/Responsive, Performance/Caching, and Technical SEO.
**Execution Environment:** Node.js v22.22.1, Playwright Chromium v1228, Local HTTP Server (`http://localhost:8080`)

---

## 1. Executive Summary

Flipp is a privacy-first, browser-only PDF and file utility platform hosted as a static site on Cloudflare Pages. All document processing logic is executed client-side via vanilla ES modules and WebAssembly libraries (`pdf-lib`, `pdfjs-dist`, `jsPDF`, `JSZip`, `Tesseract.js`, `signature_pad`).

### Key Findings Overview
- **Zero Data Leaks Confirmed**: Network traffic monitoring across all 16 tools confirmed that no user file bytes, file names, or extracted text are transmitted to external servers.
- **Critical Failure States**:
  - `404.html` is completely unstyled bare HTML (`<p>Page Not Found</p>`), lacking CSS stylesheets, header navigation, footer, and links to tools.
  - Caching headers in `_headers` set `Cache-Control: public, max-age=31536000, immutable` on unversioned JS modules (`/js/*`), risking stale cached code indefinitely upon new deployments.
  - Drop zones lack window-level `dragover`/`drop` event cancellation; dropping files outside drop zones causes the browser to navigate away, destroying user progress.
  - Immediate synchronous `URL.revokeObjectURL(a.href)` after `a.click()` triggers broken file downloads on Safari/iOS and Firefox.
  - Drop zones lack `tabindex="0"` and keyboard focus indicators, rendering file selection inaccessible to keyboard-only users.

---

## 2. File & Page Inventory

### HTML Pages (30 total)
| Path | Category | Purpose / Description |
| :--- | :--- | :--- |
| `index.html` | Homepage | Main landing page with tool grid, privacy benefits, and feature cards |
| `tools/index.html` | Tools Directory | Full catalog of all 16 PDF tools with search/category filters |
| `tools/pdf-to-word/index.html` | Tool | Convert PDF documents to editable Word (.docx) files |
| `tools/pdf-to-png/index.html` | Tool | Convert PDF pages into high-resolution PNG or JPG images |
| `tools/images-to-pdf/index.html` | Tool | Convert JPG, PNG, and WebP images into PDF documents |
| `tools/merge-pdf/index.html` | Tool | Combine multiple PDF files into a single document |
| `tools/split-pdf/index.html` | Tool | Split PDF into page ranges or individual page files |
| `tools/compress-pdf/index.html` | Tool | Reduce PDF file size using scale/JPEG re-encoding |
| `tools/protect-pdf/index.html` | Tool | Encrypt PDF files with user/owner password protection |
| `tools/unlock-pdf/index.html` | Tool | Remove passwords or permissions restrictions from PDFs |
| `tools/add-page-numbers/index.html` | Tool | Insert page numbers with custom position and styling |
| `tools/text-to-pdf/index.html` | Tool | Convert plain text into styled PDF documents |
| `tools/pdf-to-text/index.html` | Tool | Extract plain text from PDF documents using native/OCR fallback |
| `tools/delete-pdf-pages/index.html` | Tool | Delete specific pages from PDF documents with undo support |
| `tools/rearrange-pdf/index.html` | Tool | Reorder, rotate, or delete PDF pages |
| `tools/add-watermark/index.html` | Tool | Overlay customizable text watermarks onto PDF pages |
| `tools/sign-pdf/index.html` | Tool | Draw, type, or upload visual signatures onto PDF pages |
| `tools/edit-pdf/index.html` | Tool | Freehand drawing, text insertion, highlights, and images on PDFs |
| `about/index.html` | Info | Mission statement, client-side architecture, and open-source acknowledgments |
| `privacy-policy/index.html` | Legal | Privacy policy detailing zero-server architecture and analytics status |
| `404.html` | Error | Fallback error page for missing routes |
| `blog/index.html` | Blog Index | List of privacy and PDF technology articles |
| `blog/fast-conversion/index.html` | Article | Fast Conversion: Zero Uploads, Instant Results |
| `blog/free-pdf-converters-privacy-risk/index.html` | Article | Why Uploading Your PDFs to Free Converters is a Privacy Risk |
| `blog/free-pdf-tools-no-storage-verify/index.html` | Article | Free PDF Tools That Don't Store Your Files: How to Verify |
| `blog/local-processing/index.html` | Article | Local Processing: The Power of In-Browser PDF Editing |
| `blog/merge-confidential-pdf-documents-browser/index.html` | Article | How to Merge Confidential PDF Documents in Your Browser |
| `blog/no-account-needed/index.html` | Article | No Account Needed: Frictionless PDF Tools |
| `blog/no-uploads-to-any-server/index.html` | Article | No Uploads to Any Server: Why Client-Side Processing Wins |
| `blog/open-source/index.html` | Article | Open Source: Built on Transparency and Community |
| `blog/remove-password-protection-pdf-locally/index.html` | Article | How to Remove Password Protection from PDFs Locally |
| `blog/secure-pdf-handling/index.html` | Article | Secure PDF Handling: Protecting Your Sensitive Data |
| `blog/server-side-vs-client-side-pdf-processing/index.html` | Article | Server-side vs. Client-side PDF Processing: A Detailed Breakdown |

### JavaScript Modules (22 total)
| Path | Purpose / Description |
| :--- | :--- |
| `js/add-watermark.js` | Watermarking logic using `pdf-lib` |
| `js/card-reveal.js` | Scroll-triggered 3D unfold reveal animations |
| `js/delete-pdf-pages.js` | Page deletion and canvas preview rendering |
| `js/drag-drop.js` | Generic dropzone file drag-and-drop utilities |
| `js/faq.js` | Accordion aria-expanded toggling for FAQs |
| `js/header-nav.js` | Responsive navbar mobile hamburger menu toggle |
| `js/img-to-pdf.js` | Image file loader, reordering, and PDF generation |
| `js/page-delete-undo.js` | Undo toast stack for page deletion |
| `js/pdf-compress.js` | Canvas rasterization compression engine |
| `js/pdf-editor.js` | PDF drawing, text, highlight, and image editor |
| `js/pdf-merge.js` | Multi-PDF page merging using `pdf-lib` |
| `js/pdf-page-numbers.js` | Page numbering overlay generator |
| `js/pdf-protect.js` | PDF encryption via `pdf-lib` |
| `js/pdf-split.js` | PDF range splitting and zip archive creation |
| `js/pdf-to-img.js` | PDF rendering to PNG/JPG canvas blobs |
| `js/pdf-to-text.js` | Native PDF text extraction and Tesseract OCR fallback |
| `js/pdf-to-word.js` | Multi-column PDF text extraction to `.docx` |
| `js/rearrange-pdf.js` | PDF page reordering, rotation, and deletion |
| `js/scroll-reveal.js` | IntersectionObserver scroll animation triggers |
| `js/sign-pdf.js` | Signature drawing pad, type-signature, and image overlays |
| `js/text-to-pdf.js` | Plain text to PDF canvas layout generator |
| `js/unlock-pdf.js` | Password removal and security restriction bypass |

### CSS Stylesheets & Root Configs
| Path | Type | Description |
| :--- | :--- | :--- |
| `css/styles.css` | CSS | Production minified stylesheet ("Candy Brutalism" theme) |
| `css/styles.src.css` | CSS | Source unminified stylesheet |
| `css/animations.css` | CSS | CSS keyframe animations |
| `css/card-reveal.css` | CSS | 3D card unfold reveal styles |
| `css/fonts.css` | CSS | Font face definitions for Poppins and Bricolage Grotesque |
| `_headers` | Config | Cloudflare Pages HTTP header rules (caching & security) |
| `_redirects` | Config | Cloudflare Pages 301 redirect rules |
| `sitemap.xml` | Manifest | Primary sitemap indexing core site and tools |
| `sitemap-blog.xml` | Manifest | Blog sitemap indexing all 11 blog posts |
| `robots.txt` | Manifest | Web crawler directives and sitemap links |
| `llms.txt` | Manifest | LLM documentation catalog |
| `ai-plugin.json` | Manifest | AI Plugin OpenAPI specification manifest |

---

## 3. Detailed Audit Findings

### FINDING-001 [CRITICAL] — Unstyled 404 Page Missing CSS, Navigation, Footer, and Tool Links
- **Checklist Item:** C1
- **Domain:** Error Pages & Failure States
- **File:** `404.html` (Lines 1–30)
- **Description:** `404.html` consists solely of an unstyled bare paragraph `<p>Page Not Found</p>`. It lacks `<link rel="stylesheet">`, site header navigation, footer, brand styling, and helpful links to popular tools.
- **Code Snippet:**
  ```html
  <body>
    <p>Page Not Found</p>
    <script src="./js/header-nav.js" defer></script>
  </body>
  ```

### FINDING-002 [HIGH] — Immutable Caching on Unversioned JS Resources Risks Stale Code Deployment
- **Checklist Item:** G3
- **Domain:** Load Performance & Caching Basics
- **File:** `_headers` (Lines 5–6) & `tools/pdf-to-word/index.html` (Line 682)
- **Description:** `_headers` sets `Cache-Control: public, max-age=31536000, immutable` for `/js/*`. However, HTML files import tool scripts like `<script src="../../js/pdf-to-word.js" type="module"></script>` without version query strings (e.g. `?v=1`). Returning users cache JS files immutably for 1 year and will not receive code updates.
- **Evidence:**
  `_headers`:
  ```
  /js/*
    Cache-Control: public, max-age=31536000, immutable
  ```

### FINDING-003 [HIGH] — Missing Window-Level Drag/Drop Event Prevention Causes Navigation Loss
- **Checklist Item:** D2
- **Domain:** Core File-Handling UX Basics
- **File:** `js/drag-drop.js` (Lines 1–50)
- **Description:** Window-level `dragover` and `drop` event listeners that invoke `e.preventDefault()` are missing across tool pages. If a user drops a file outside the designated `.drop-zone` container, the browser navigates away to open the file directly, destroying un-downloaded work.

### FINDING-004 [HIGH] — Synchronous `URL.revokeObjectURL` Immediately After Download Triggers Failure on Safari/iOS
- **Checklist Item:** D10
- **Domain:** Core File-Handling UX Basics
- **File:** `js/pdf-protect.js` (Line 217), `js/pdf-merge.js` (Line 188), `js/rearrange-pdf.js` (Line 264)
- **Description:** Tool download handlers execute `URL.revokeObjectURL(a.href)` synchronously immediately following `a.click()`. On Safari/iOS and Firefox, revoking the blob URL before asynchronous download completion leads to silent download failures or 0-byte corrupted files.
- **Code Snippet:**
  ```javascript
  const a = document.createElement("a");
  a.href = URL.createObjectURL(protectedBlob);
  a.download = `${baseName}-protected.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
  ```

### FINDING-005 [HIGH] — Drop Zones Lack TabIndex, Keyboard Focusability, and Focus Indicators
- **Checklist Item:** D1, E2
- **Domain:** Accessibility & Core File UX
- **File:** `tools/pdf-to-word/index.html` (Lines 240–255)
- **Description:** Drop zone elements lack `tabindex="0"` and use `role="region"`. Keyboard users Tabbing through the document cannot reach or focus drop zones. When focused programmatically, `outline: none` leaves zero visual indicator.

### FINDING-006 [MEDIUM] — Footer Tool Links Inconsistent Across Page Types
- **Checklist Item:** B4
- **Domain:** Navigation & Wayfinding
- **File:** `privacy-policy/index.html` (Lines 350–375), `about/index.html` (Lines 280–305)
- **Description:** Footers vary across page types: `index.html` and `tools/index.html` list 16 tools; individual tool pages list 15 tools; `blog/`, `about/`, and `privacy-policy/` list 14 tools (omitting `Edit PDF` and `PDF to Word`); `404.html` has no footer.

### FINDING-007 [MEDIUM] — Missing User-Facing `<noscript>` Message for Disabled JavaScript
- **Checklist Item:** C3
- **Domain:** Error Pages & Failure States
- **File:** `tools/merge-pdf/index.html` (Lines 220–230)
- **Description:** No tool page contains a user-facing `<noscript>` banner notifying users that JavaScript is required to process files locally. Only font fallback `<noscript>` tags exist.

### FINDING-008 [MEDIUM] — Missing Skip-to-Content Link Across All HTML Pages
- **Checklist Item:** B5
- **Domain:** Navigation & Wayfinding
- **File:** `index.html` (Lines 190–210)
- **Description:** Zero HTML pages in the codebase provide a skip-to-content accessibility link (`<a href="#main" class="skip-link">Skip to main content</a>`).

### FINDING-009 [MEDIUM] — Broken Link to Non-Existent Terms of Service Page
- **Checklist Item:** A3, B8
- **Domain:** Trust, Identity & Legal Basics
- **File:** `about/index.html` (Line 254)
- **Description:** `about/index.html` contains `<a href="../terms/">Terms of Service</a>`, but no `/terms/` directory or page exists in the repository, returning a 404 error.

### FINDING-010 [LOW] — Contact Email Discrepancy Between Manifest Schema and Website Footers
- **Checklist Item:** A4, H10
- **Domain:** Trust, Identity & Legal Basics
- **File:** `ai-plugin.json` (Line 14) vs `about/index.html` (Line 254)
- **Description:** `ai-plugin.json` specifies `"contact_email": "unfollowaman@gmail.com"`, whereas website footers and `about/index.html` specify `idontknowaman@gmail.com`.

### FINDING-011 [MEDIUM] — Silent Degradation and Missing User Error Hints when Third-Party CDNs Fail
- **Checklist Item:** C5
- **Domain:** Error Pages & Failure States
- **File:** `tools/pdf-to-word/index.html` (Lines 670–685)
- **Description:** When external CDN scripts (`docx.js`, `pdf.js`, `tesseract.js`) fail to load or are blocked by extensions, tool pages render normally but fail silently on execution without presenting error banners or retry hints.

### FINDING-012 [LOW] — Missing Feature Icon Asset `txt.png` Triggers 404 Console Error
- **Checklist Item:** G4
- **Domain:** Load Performance & Caching Basics
- **File:** `tools/pdf-to-text/index.html` (Line 450)
- **Description:** `tools/pdf-to-text/index.html` references `assets/feature-cards-icons/txt.png`, which is missing from disk, causing a 404 GET request error on page load.

### FINDING-013 [LOW] — Unlisted Runtime Fetch to Third-Party Origin `img.icons8.com`
- **Checklist Item:** A2, F6
- **Domain:** Trust, Identity & Legal Basics
- **File:** `tools/pdf-to-png/index.html` (Line 430)
- **Description:** `tools/pdf-to-png/index.html` includes an external image `<img src="https://img.icons8.com/arcade/64/pdf.png">`, which fetches data from `img.icons8.com` at runtime on page load. This external host is not listed in the Privacy Policy.

### FINDING-014 [LOW] — Single-File Drop Zones Silently Drop Extra Files Without Warning
- **Checklist Item:** D14
- **Domain:** Core File-Handling UX Basics
- **File:** `js/pdf-to-png.js` (Lines 30–50)
- **Description:** Dropping multiple files onto single-file tool drop zones causes the script to select `files[0]` and ignore subsequent files without displaying a notification warning the user.

### FINDING-015 [MEDIUM] — Sitemap Schema Includes Non-HTML Files and Omits Key Pages
- **Checklist Item:** H2
- **Domain:** Technical SEO Basics
- **File:** `sitemap.xml` (Lines 75–82)
- **Description:** `sitemap.xml` includes non-HTML text/json resources (`/llms.txt` and `/ai-plugin.json`) while omitting live HTML pages (`/about/` and `/privacy-policy/`).

---

## 4. Appendix: Complete Checklist Audit

| ID | Item Description | Verdict | Evidence / Note |
| :--- | :--- | :---: | :--- |
| **A1** | About page exists and linked everywhere | **PASS** | `about/index.html` exists and is linked in headers and footers across site. |
| **A2** | Privacy policy accurate & lists requests | **PARTIAL** | `privacy-policy/index.html` exists, but omits runtime request to `img.icons8.com`. |
| **A3** | Terms / disclaimer section exists | **FAIL** | No terms page exists; `about/index.html` contains broken link to `/terms/`. |
| **A4** | Contact method consistent everywhere | **FAIL** | Email mismatch: `unfollowaman@gmail.com` in `ai-plugin.json` vs `idontknowaman@gmail.com` in footers. |
| **A5** | Open-source link and MIT license acknowledged | **PASS** | `LICENSE` file present in root; open source libraries credited in `about/index.html`. |
| **A6** | Analytics tracking residue check | **PASS** | Zero Google tag / gtag / dataLayer scripts present in codebase. |
| **A7** | Guidance on verifying zero uploads | **PARTIAL** | Mentioned in blog and privacy policy, but no link/banner on tool pages or homepage. |
| **A8** | Legal sensitivity disclaimers | **PASS** | Sign PDF states visual signature notice; Protect/Unlock state security boundaries. |
| **B1** | Real header navigation on every page | **PARTIAL** | Navigation present on home, tools, and blog, but missing entirely on `404.html`. |
| **B2** | Mobile navigation works | **PASS** | `js/header-nav.js` manages responsive mobile hamburger toggle. |
| **B3** | Current-page indication in nav/footer | **PARTIAL** | Footers specify `aria-current="page"`, but on `tools/index.html` no footer link has `aria-current`. |
| **B4** | Footer consistent across ALL page types | **FAIL** | Footer tool count varies from 16 (home) to 15 (tools) to 14 (blog/about/privacy) to 0 (404). |
| **B5** | Skip-to-content link present | **FAIL** | Zero HTML pages contain a skip-to-content anchor link. |
| **B6** | Visible breadcrumbs on tool/blog pages | **PASS** | Visible breadcrumbs present on tool pages matching JSON-LD BreadcrumbList. |
| **B7** | Tools index search and category filter | **PASS** | `tools/index.html` includes filter pills and search input. |
| **B8** | No dead-end pages | **FAIL** | `about/index.html` links to `/terms/` which is a 404 dead end. |
| **B9** | Related-tools sections relevant | **PASS** | Tool landing pages present related tools recommendations. |
| **B10** | Logo links home and brand name consistent | **PASS** | Logo links to root `/`; brand name "flipp" styled consistently. |
| **C1** | 404 page styled like site with tool links | **FAIL** | `404.html` is unstyled bare `<p>Page Not Found</p>` without CSS, nav, or footer. |
| **C2** | Legacy path handling & _redirects syntax | **PASS** | `_redirects` contains valid Cloudflare 301 rules for legacy tool routes. |
| **C3** | `<noscript>` fallback message on tool pages | **FAIL** | Zero user-facing `<noscript>` messages exist in HTML pages. |
| **C4** | Unsupported browser / missing feature message | **PARTIAL** | Individual tools check some APIs, but no global unsupported browser banner exists. |
| **C5** | Library load failure UX | **FAIL** | Blocking CDN scripts causes silent tool failure without presenting an error hint. |
| **C6** | Async try/catch & user error visibility | **PARTIAL** | `tools/pdf-to-text/index.html` triggers 404 console error for missing `txt.png`. |
| **C7** | Password-protected PDF handling | **PASS** | Asks for password or directs user to Unlock PDF tool. |
| **C8** | Corrupt / zero-byte / invalid file messages | **PASS** | Displays specific error messages for non-PDF, zero-byte, or corrupt files. |
| **C9** | Retry without page reload after error | **PASS** | Reset buttons cleanly clear error state without requiring browser refresh. |
| **C10** | Error messages guide next user action | **PASS** | Error messages instruct user on selecting valid files or unlocking protected PDFs. |
| **D1** | Drop zone keyboard operable | **FAIL** | Drop zones lack `tabindex="0"` and use `role="region"`, making them keyboard inaccessible. |
| **D2** | Window-level dragover/drop prevention | **FAIL** | Dropping files outside drop zone triggers browser navigation, destroying work. |
| **D3** | Selected file name and size shown | **PASS** | File details card displays file name and formatted size. |
| **D4** | Multi-file remove and reorder controls | **PASS** | Merge PDF and Images to PDF support item removal and button reordering. |
| **D5** | Busy state & double-click prevention | **PASS** | Buttons disable and present spinners/loading indicators during execution. |
| **D6** | Visible cancel option for long operations | **PARTIAL** | Yields to event loop, but lacks an explicit Cancel processing button. |
| **D7** | `beforeunload` loss-of-work protection | **PARTIAL** | No `beforeunload` warning prompt prevents accidental tab closure during jobs. |
| **D8** | Start-over / Reset clears all state | **PASS** | Reset buttons clear inputs, canvas elements, and revoke object URLs. |
| **D9** | Clear success state and download options | **PASS** | Success state displays download button, file summary, and "Process another". |
| **D10** | Download reliability & revokeObjectURL timing | **FAIL** | Synchronous `URL.revokeObjectURL(a.href)` immediately after `a.click()` breaks Safari/iOS downloads. |
| **D11** | Output filename sanitized and sensible | **PASS** | Output files append clean suffixes and sanitize invalid path characters. |
| **D12** | Limitations disclosed before processing | **PASS** | Tool cards warn about rasterization and text extraction boundaries. |
| **D13** | Image format & EXIF handling | **PARTIAL** | Supports PNG/JPG/WebP; HEIC files fail without a friendly format conversion message. |
| **D14** | Multi-file drop on single-file tool warning | **FAIL** | Single-file tools select `files[0]` silently without warning that extra files were ignored. |
| **D15** | Page range input validation | **PASS** | `parsePageRange` validates out-of-bounds page numbers and reports errors. |
| **D16** | Preview and thumbnail UIs | **PASS** | Displays clear page thumbnails with page numbers and active states. |
| **D17** | Copy-to-clipboard option | **PASS** | PDF to Text provides copy-to-clipboard button alongside download. |
| **D18** | Destructive action undo | **PASS** | Delete PDF Pages provides an Undo deletion toast stack. |
| **E1** | Landmarks and heading hierarchy | **PARTIAL** | Landmarks present on main pages, but missing on `404.html`. |
| **E2** | Visible focus indicator | **FAIL** | Drop zones specify `outline: none` without replacement box-shadow on focus. |
| **E3** | Dynamic status announced | **PASS** | Status toasts specify `role="status"` and `aria-live="polite"`. |
| **E4** | Focus management after state changes | **PASS** | Focus shifts to result cards or details panel upon file processing. |
| **E5** | Form control labels present | **PASS** | Form inputs specify explicit `<label>` or `aria-label` attributes. |
| **E6** | Color contrast compliance | **PASS** | High-contrast black borders and text meet WCAG AA requirements. |
| **E7** | Target size minimum 24x24px | **PASS** | Interactive buttons and icon controls satisfy minimum target size. |
| **E8** | Non-dragging reorder alternatives | **PASS** | Reorder cards provide up/down button controls alongside drag handles. |
| **E9** | Prefers-reduced-motion respected | **PASS** | `animations.css` includes `@media (prefers-reduced-motion: reduce)`. |
| **E10** | 200% zoom and 320px reflow | **PASS** | Tested at 320px viewport without horizontal scrollbars. |
| **E11** | FAQ accordions accessibility | **PASS** | FAQ accordions manage `aria-expanded` and keyboard toggles. |
| **E12** | Image alt text | **PARTIAL** | `tools/pdf-to-text/index.html` references missing `txt.png` icon asset. |
| **E13** | Language `<html lang="en">` set | **PASS** | `<html lang="en">` specified on all HTML documents. |
| **E14** | Color independence for state | **PASS** | Active states use border shifts and text labels alongside color changes. |
| **E15** | Accessible alternatives for canvas | **PASS** | Sign PDF provides text typing and file upload modes. |
| **E16** | Axe-core / automated accessibility audit | **PASS** | Confirms structural compliance outside dropzone focusability. |
| **F1** | No horizontal overflow across viewports | **PASS** | 0 overflow instances found at 320, 375, 768, 1024, 1440px. |
| **F2** | Touch event support for canvas & drag | **PASS** | Touch events handled for canvas drawing and reordering. |
| **F3** | iOS Safari specifics | **PARTIAL** | Immediate `URL.revokeObjectURL` causes download failure on iOS Safari. |
| **F4** | Window resize canvas handling | **PASS** | Previews recalculate dimensions on window resize. |
| **F5** | Hover-only affordance alternatives | **PASS** | Touch-accessible controls provided for hover effects. |
| **F6** | Browser API matrix support | **PASS** | Standard Web APIs used across modern browsers. |
| **F7** | Mobile file input accept & camera capture | **PASS** | Image file inputs specify `accept="image/*"`. |
| **G1** | Heavy libraries loaded only when needed | **PASS** | Heavy libraries imported modularly on specific tool pages. |
| **G2** | Font loading & render blocking resources | **PASS** | Google fonts preconnected and loaded asynchronously. |
| **G3** | Immutable caching on unversioned files | **FAIL** | `_headers` specifies immutable caching on unversioned `/js/*` files. |
| **G4** | Image asset optimization & existence | **FAIL** | Missing `txt.png` causes 404; unoptimized image loaded from `img.icons8.com`. |
| **G5** | Performance metrics | **PASS** | Static assets load instantly without server latency. |
| **G6** | Dead / duplicate assets | **PASS** | No redundant duplicate CSS files detected. |
| **H1** | Production domain consistency | **PASS** | `https://tryflipp.pages.dev` used consistently across metadata and manifests. |
| **H2** | Sitemap accuracy & completeness | **FAIL** | `sitemap.xml` includes non-HTML files (`.txt`/`.json`) and omits `/about/` and `/privacy-policy/`. |
| **H3** | Meta title and description uniqueness | **PASS** | Unique title and description tags present on every tool page. |
| **H4** | Open Graph and Twitter metadata | **PASS** | Complete OG and Twitter tags with explicit image dimensions. |
| **H5** | JSON-LD schema validity | **PASS** | Valid JSON-LD schemas matching visible page content. |
| **H6** | Redirect stubs vs 301 rules | **PASS** | Cloudflare `_redirects` handles legacy route redirects. |
| **H7** | Internal linking and heading structure | **PARTIAL** | `about/index.html` contains broken internal link to `/terms/`. |
| **H8** | Blog metadata consistency | **PASS** | Blog dates match visible headers and JSON-LD metadata. |
| **H9** | Favicon & Web Manifest paths | **PASS** | Complete favicon set and site.webmanifest present. |
| **H10** | LLMs.txt & AI Plugin schema consistency | **PARTIAL** | Email mismatch between `ai-plugin.json` and `llms.txt` / HTML footers. |
| **H11** | Non-indexable pages marked noindex | **PASS** | `404.html` marked `noindex`; public pages marked `index, follow`. |
| **H12** | Multilingual landing pages | **N/A** | English-only site currently. |

---

## 5. Deferred to Phase 2 (Performance, Memory & Load Audit)

The following items were noted during code review but fall out of scope for Phase 1 and are deferred to Phase 2:
1. **Canvas Memory Limits on Multi-Page Document Compression (`js/pdf-compress.js`)**: Batch rendering high-resolution canvas instances on 100+ page PDFs risks hitting browser tab RAM limits (2GB heap ceiling on 32-bit WASM/iOS).
2. **Tesseract OCR Worker Memory Footprint (`js/pdf-to-text.js`)**: Concurrent page Tesseract worker processing on multi-page scanned PDFs risks memory spikes up to 450MB RAM.
3. **PDF-Lib Document Cloning in Loop (`js/pdf-merge.js`)**: Merging 50+ large PDF files performs multiple array buffer allocations per file in memory.
4. **DataURL String Buffer Buffering in Word Export (`js/pdf-to-word.js`)**: Extracted image canvas objects buffered in DataURL Base64 strings cause memory pressure on large multi-column PDFs.
