# Flipp Audit Knowledge

## Audit System

- **Audit rotation:** Rotating through PDF processing tools, shared file utilities, security boundaries, privacy compliance, and test suite execution.
- **Last audited areas:**
  - 2026-09-24: PDF Compression (`js/pdf-compress.js`, `tools/compress-pdf/index.html`, `tests/pdf-compress.test.js`)
  - 2026-09-18: PDF Security & Protection (`js/unlock-pdf.js`, `js/pdf-protect.js`, test harness)
- **Areas requiring follow-up:**
  - Re-audit PDF protection (`js/pdf-protect.js`) when vector/text preservation support is implemented for encrypted exports.
- **Known recurring risks:**
  - Standard test suite execution assumes all browser globals or mock dependencies are evaluated via `new Function()` rather than direct `require()` calls to external npm packages that are not pre-installed in `node_modules`.
  - Memory consumption when rendering high-DPI canvases for multi-page PDFs in browser-side conversion loops.

## Repository Knowledge

- **Important architectural observations:**
  - **Zero-Server Philosophy:** All file transformations run 100% client-side in the browser using HTML5 Canvas, Web Workers, and client-side JavaScript libraries. No user files or extracted content are transmitted to any external server or backend API.
  - **Tool Module Pattern:** Each tool resides in `tools/<tool-name>/index.html` backed by a matching module in `js/<tool-name>.js`.
- **Important shared utilities:**
  - `js/drag-drop.js`: Provides file dropzone initialization (`initDropZone`), toast alerts (`showToast`), file download trigger (`triggerDownload`), and button pill state toggling (`activatePill`).
  - `js/page-delete-undo.js`: Manages undo state, page particle removal animations, accessibility live region announcements, and page restoration across thumbnail tools.
- **Critical dependencies:**
  - `pdfjs-dist`: Loaded via CDN script tag for client-side PDF rendering and text parsing.
  - `pdf-lib`: Loaded via CDN (`window.PDFLib`) for PDF modification (splitting, merging, deleting pages, page extraction).
  - `jsPDF`: Loaded via CDN (`window.jspdf.jsPDF`) for client-side PDF document generation and encryption.
  - `JSZip`: Loaded via CDN (`window.JSZip`) for bundling exported page images or split files into ZIP archives.
- **Security-sensitive areas:**
  - User-supplied PDF inputs and password handling (`js/unlock-pdf.js`, `js/pdf-protect.js`).
  - Filename sanitization during export/download generation (`safeName.replace(/[\\/]/g, "_")`).
  - Object URL lifecycle management (`URL.createObjectURL` and `URL.revokeObjectURL`) to prevent memory leaks and unexpected resource retention.
- **Important relationships between components:**
  - `js/pdf-compress.js` provides worker-pool map concurrency (`mapConcurrent`) and supports two distinct compression paths: structural metadata cleanup via `pdf-lib` ("recommended") vs. canvas image rasterization via `pdfjs-dist` and `jsPDF` ("maximum").
  - `js/unlock-pdf.js` depends on `pdf-lib`'s `PDFDocument.load` with `{ ignoreEncryption: true }` or `{ password }` and `copyPages`.
  - `js/pdf-protect.js` uses `pdfjs-dist` to render PDF pages onto canvases and `jsPDF` with the `encryption` configuration parameter to re-encode the PDF with user/owner passwords.

## Known Issues

None currently active.

## Audit History

### 2026-09-24 — PDF Compression (`js/pdf-compress.js`)

Status: PASS

Scope:
- Client-side PDF compression flows ("recommended" lossless structure optimization vs "maximum" image rasterization).
- Concurrency control utility `mapConcurrent` worker pool.
- Memory/resource management (`canvas.width = 0; canvas.height = 0`, `page.cleanup()`, `pdfjsDoc.destroy()`, and `URL.revokeObjectURL`).
- Filename sanitization, UI progress updates, and zero-server privacy compliance.
- Unit test suite execution (`tests/pdf-compress.test.js`).

Evidence:
- Executed unit tests (`node --test tests/pdf-compress.test.js`): 22/22 subtests passed across 6 test suites.
- Executed complete test suite (`node --test tests/*.test.js tests/test_pdf_to_img.js`): 309/309 tests passed with 0 failures.
- Inspected `js/pdf-compress.js` and `tools/compress-pdf/index.html` source directly.
- Traced `mapConcurrent(items, limit, fn)` execution and verified bounded concurrency (limit = 5) and input index result ordering.
- Verified DOM & resource cleanup: object URLs revoked on reset and re-compression; canvas dimensions zeroed out; PDF.js pages and documents cleaned up in `finally` blocks.
- Confirmed zero network calls / external API transmissions during file processing.

Findings:
1. **Compression Modes:** "Recommended" mode uses `pdf-lib` to strip metadata (title, author, subject, keywords, producer, creator) and re-saves with `{ useObjectStreams: true }`. "Maximum" mode uses `pdfjs-dist` to render pages to JPEG canvases (scale 1.5, quality 0.7) and builds a compressed document using `jsPDF`.
2. **Concurrency & Memory Safety:** `mapConcurrent` properly limits active page renders to 5 workers concurrently without head-of-line batch blocking. Canvases are zero-sized (`width = 0; height = 0`) immediately after `toDataURL()` conversion, and `page.cleanup()` / `pdfjsDoc.destroy()` are invoked in `finally` blocks.
3. **Privacy Compliance:** All compression happens strictly client-side on the user's device in compliance with Flipp's zero-server architecture.
4. **Filename Handling:** Input filenames are sanitized with `.replace(/[\\/]/g, "_")` before appending `-compressed.pdf`.

Follow-up:
- Monitor memory usage when compressing ultra-large multi-page documents (100+ pages) in "maximum" mode on mobile viewports.

Relevant files:
- `js/pdf-compress.js`
- `tools/compress-pdf/index.html`
- `tests/pdf-compress.test.js`

### 2026-09-18 — Resolution of `tests/unlock-pdf.test.js` Test Runner Failure

Status: PASSED

Scope:
- Unit test harness for Unlock PDF tool (`tests/unlock-pdf.test.js`)
- Integration with client-side script (`js/unlock-pdf.js`)
- Full native test suite execution (`node --test tests/*.test.js tests/test_pdf_to_img.js`)

Resolution Summary:
- Investigated confirmed test runner failure caused by direct npm module require `const { PDFDocument } = require("pdf-lib");` in `tests/unlock-pdf.test.js`.
- Refactored `tests/unlock-pdf.test.js` to eliminate direct external package imports and match the repository's established browser-mock test architecture (`new Function()` evaluation with `global.window.PDFLib` mocking).
- Expanded assertions to cover non-PDF validation, unprotected PDFs, open-password protected PDFs, owner-restricted PDFs, corrupted PDF input, file download trigger, reset action, and unlock error paths.
- Verified test execution: `node --test tests/unlock-pdf.test.js` passed 6/6 subtests.
- Verified full test suite: `node --test tests/*.test.js tests/test_pdf_to_img.js` passed 252/252 tests across 69 test files with 0 failures and 0 regressions.

### 2026-09-18 — PDF Security & Protection (`Unlock PDF` & `Protect PDF`)

Status: WARNING

Scope:
- In-browser PDF unlocking flow (`js/unlock-pdf.js` & `tools/unlock-pdf/index.html`)
- In-browser PDF protection/encryption flow (`js/pdf-protect.js` & `tools/protect-pdf/index.html`)
- Test coverage (`tests/unlock-pdf.test.js`, `tests/pdf-protect.test.js`)
- Zero-server privacy compliance verification

Evidence:
- Executed native Node test suite: `node --test tests/*.test.js tests/test_pdf_to_img.js`. 246 subtests passed across 23 test suites.
- Verified test failure in `tests/unlock-pdf.test.js` (`MODULE_NOT_FOUND` for `pdf-lib`).
- Inspected `js/unlock-pdf.js` and `js/pdf-protect.js` source code directly.
- Traced execution paths for PDF decryption, password validation, canvas page rendering, encryption options, and blob URL creation/revocation.
- Confirmed zero network calls / external API transmissions during PDF processing operations.

Findings:
1. **Password Unlocking (`js/unlock-pdf.js`):** Functionality is implemented correctly using `pdf-lib`. Handles both owner-restricted PDFs (via `ignoreEncryption: true`) and password-protected PDFs (prompting for password). Filenames are sanitized with `.replace(/[\\/]/g, "_")` before download. Object URLs are cleaned up after 100ms timeout or reset.
2. **Password Protection (`js/pdf-protect.js`):** Validates password length (min 8 chars) and match confirmation. Uses `pdfjs-dist` to render pages to high-resolution JPEG canvases and builds an encrypted PDF document with `jsPDF` (`encryption` option). Properly calls `page.cleanup()` and `pdfjsDoc.destroy()` in `finally` blocks.
3. **Architectural Observation on PDF Protection:** Re-encoding PDF pages as canvas JPEG images in `jsPDF` rasterizes page text into images. This successfully enforces browser-side PDF password protection (since `pdf-lib` lacks save-time encryption support), but loses selectable text.
4. **Test Suite Failure:** `tests/unlock-pdf.test.js` fails in environments without installed `node_modules` due to direct `require('pdf-lib')`.

Follow-up:
- Re-audit `js/pdf-protect.js` if native vector/text preservation is added to encrypted exports.

Relevant files:
- `js/unlock-pdf.js`
- `tools/unlock-pdf/index.html`
- `js/pdf-protect.js`
- `tools/protect-pdf/index.html`
- `tests/unlock-pdf.test.js`
- `tests/pdf-protect.test.js`
