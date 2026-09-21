# Flipp Audit Knowledge

## Audit System

- **Audit rotation:** Rotating through PDF processing tools, shared file utilities, security boundaries, privacy compliance, and test suite execution.
- **Last audited areas:**
  - 2026-09-22: Merge PDF (`js/pdf-merge.js`, `tools/merge-pdf/index.html`, `tests/pdf-merge.test.js`)
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
  - `js/drag-drop.js`: Provides file dropzone initialization (`initDropZone`), toast alerts (`showToast`), file download trigger (`triggerDownload`), button pill state toggling (`activatePill`), drag-and-drop reordering (`setupDragReorder`), and PDF first-page thumbnail rendering (`renderPdfFirstPage`).
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
  - `js/pdf-merge.js` relies on `renderPdfFirstPage` from `js/drag-drop.js` to extract thumbnail canvas previews and `setupDragReorder` for reordering cards.
  - `js/pdf-merge.js` uses `PDFLib.PDFDocument.create()` and `copyPages` from `pdf-lib` to combine selected document pages in user-specified order without text/vector rasterization.
  - `js/unlock-pdf.js` depends on `pdf-lib`'s `PDFDocument.load` with `{ ignoreEncryption: true }` or `{ password }` and `copyPages`.
  - `js/pdf-protect.js` uses `pdfjs-dist` to render PDF pages onto canvases and `jsPDF` with the `encryption` configuration parameter to re-encode the PDF with user/owner passwords.

## Known Issues

None currently active.

## Audit History

### 2026-09-22 — Merge PDF

Status: PASS

Scope:
- In-browser PDF merge processing flow (`js/pdf-merge.js` & `tools/merge-pdf/index.html`)
- Drag-and-drop file upload and visual reordering (`js/drag-drop.js` integration)
- Native test suite execution (`tests/pdf-merge.test.js`)
- Zero-server privacy compliance verification

Evidence:
- Executed full test suite: `node --test tests/*.test.js tests/test_pdf_to_img.js`. 270 subtests passed across all test files with 0 failures.
- Directly inspected `js/pdf-merge.js` and `tools/merge-pdf/index.html`.
- Verified file selection filters non-PDF files and presents toast notification on invalid selection.
- Verified document loading uses `Promise.all` across selected PDF items and leverages `pdf-lib`'s `copyPages` for lossless page combining without quality loss or re-encoding.
- Confirmed thread-yielding mechanism (`await new Promise((r) => setTimeout(r, 50));`) allows browser DOM paint during button loading state update.
- Confirmed Blob download lifecycle: Object URL is created (`URL.createObjectURL`), attached to anchor tag, clicked, and revoked (`URL.revokeObjectURL`) immediately after.
- Confirmed complete zero-server privacy compliance with 0 external network requests during PDF processing operations.

Findings:
1. **Document Merging (`js/pdf-merge.js`):** Functional and correct. PDF-lib accurately copies source page streams into a new `PDFDocument`.
2. **Interactive UI Reordering:** Reordering drag events update both DOM card attributes and underlying array positions cleanly.
3. **Download & Resource Cleanup:** Object URL created on download is immediately revoked upon execution.
4. **Test Suite Coverage:** Unit test suite in `tests/pdf-merge.test.js` exercises low-PDF count guard, missing PDF-lib guard, thumbnail card rendering with drag registration, and concurrent `Promise.all` merging.

Follow-up:
- Re-audit `js/pdf-merge.js` if large-file stream processing or Web Worker offloading is introduced.

Relevant files:
- `js/pdf-merge.js`
- `tools/merge-pdf/index.html`
- `tests/pdf-merge.test.js`

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
