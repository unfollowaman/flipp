## 2025-09-13 - Release PDF.js page and document resources in PDF processing loops
**Learning:** In Flipp's client-side architecture, PDF.js retains page fonts, canvas backings, and internal worker streams in memory during text extraction and rendering tasks. Not invoking `page.cleanup()` or `pdfDoc.destroy()` causes accumulated memory overhead on large multi-page PDFs.
**Action:** Always call `page.cleanup()` in a `try...finally` block inside page processing loops, and call `await pdfDoc.destroy()` in a top-level `finally` block when completing or catching errors in PDF processing workflows.

## 2026-09-14 - Avoid redundant ArrayBuffer cloning when passing buffers to PDF.js getDocument
**Learning:** In Flipp's client-side file processing pipeline, calling `.slice(0)` on an `ArrayBuffer` before passing it to `pdfjsLib.getDocument()` duplicates the entire file's byte array in RAM, doubling peak memory consumption without functional benefit when the buffer is not accessed again.
**Action:** Pass `arrayBuffer` directly to `pdfjsLib.getDocument(arrayBuffer)` unless the raw array buffer is explicitly mutated or re-used concurrently by another library (e.g., PDF-lib).

## 2026-09-15 - Defer array sorting and compute running stats incrementally in PDF line grouping
**Learning:** In layout reconstruction for PDF conversion (such as `js/pdf-to-word.js`), sorting line item arrays (`line.items.sort()`) and recalculating average Y coordinates and font styles on every item insertion inside nested matching loops creates O(N^2 log N) performance penalties.
**Action:** In grouping algorithms, update running totals (`sumTopY`) and boolean/max properties (`fontSize`, `isBold`) incrementally per item addition, and defer item sorting until all items have been assigned to lines.

## 2026-09-16 - Discard superseded preview renders and debounce range inputs in interactive PDF tools
**Learning:** In interactive PDF tools (such as PDF Split range inputs), rapid user keystrokes fire consecutive async `pdfDocument.getPage()` and `page.render()` tasks. Without request tracking per container, outdated render promises run in parallel on detached DOM nodes, creating UI race conditions and heavy worker thread contention.
**Action:** Track active request IDs per target container in a `Map`, debounce user input handlers, and check `activeRenderTasks.get(container) === currentRequestId` after fetching pages before proceeding to canvas creation and `page.render()`.

## 2026-09-17 - Cache external font ArrayBuffers in memory for client-side PDF document generation
**Learning:** In client-side PDF document processing (such as `js/pdf-page-numbers.js`), fetching custom font assets (like `.woff` files) over the network on every user action creates unnecessary network latency and bandwidth overhead on repeated operations.
**Action:** Cache the font fetch `ArrayBuffer` promise in memory across executions (resetting on fetch failure), and pass a cloned `ArrayBuffer` slice (`fontBytes.slice(0)`) to `pdfDoc.embedFont()` to eliminate repeated network fetches while protecting against buffer detachment.

## 2026-09-18 - Cache DOM overlay elements in a Map during object rendering passes
**Learning:** In interactive canvas/overlay editors (such as `js/pdf-editor.js`), executing `document.querySelector` lookups inside object rendering loops performs O(N * P) DOM tree traversals.
**Action:** Map DOM container/overlay elements by key (e.g. `pageNum`) into a `Map` during initial clearing, reducing element lookups inside item rendering loops to O(1).

## 2026-09-19 - Skip canvas.toDataURL() during thumbnail preview rendering when appending canvas directly
**Learning:** In client-side PDF preview generation (such as `js/pdf-to-img.js`), invoking `canvas.toDataURL()` on rendered PDF pages performs CPU-intensive PNG image encoding and allocates large base64 strings in RAM. When thumbnails are appended directly as DOM `<canvas>` elements, generating data URLs is completely unused and creates unnecessary overhead.
**Action:** Parameterize page canvas rendering helpers to accept `generateDataUrl = true`, and pass `false` when rendering DOM preview thumbnails to skip `canvas.toDataURL()`.

## 2026-09-20 - Cache parsed PDF-lib RGB color objects across page watermark iterations
**Learning:** In document generation loops (such as `js/add-watermark.js`), parsing hex color strings (`parseInt` / `slice`) and calling `pdfLib.rgb(r, g, b)` repeatedly for every page creates avoidable CPU parsing overhead and temporary object allocations on multi-page PDFs.
**Action:** Cache `rgb(r, g, b)` objects in a `Map` keyed by hex string within the conversion task scope to reuse color instances across pages.

## 2026-09-21 - Inspect image dimensions via createImageBitmap and defer Base64 data URL conversion
**Learning:** In image processing pipelines (such as `js/img-to-pdf.js`), pre-loading all input `File`/`Blob` objects into Base64 data URLs up-front allocates large strings concurrently in memory. Furthermore, assigning Base64 strings to `HTMLImageElement.src` forces main-thread Base64 decoding just to read image dimensions.
**Action:** Use `createImageBitmap(file)` (or `URL.createObjectURL` fallback) on raw `File`/`Blob` inputs to inspect dimensions without Base64 encoding, and defer `fileToDataUrl` conversion to inside the sequential page loop so Base64 strings are allocated on demand and garbage-collected per page.

## 2026-09-22 - Cache input file ArrayBuffer across preview loading and document splitting
**Learning:** In client-side PDF document manipulation tools (such as `js/pdf-split.js`), re-reading `await file.arrayBuffer()` upon action execution triggers an asynchronous File read from browser storage/disk when the ArrayBuffer was already read during initial preview generation.
**Action:** Store the loaded `ArrayBuffer` in a module variable (`originalPdfBytes`) when a file is selected, pass a cloned slice (`originalPdfBytes.slice(0)`) to `pdf.js` worker tasks, reuse `originalPdfBytes` directly in subsequent `PDFLib.PDFDocument.load` operations, and set `originalPdfBytes = null` on UI reset or file reload.

## 2026-09-23 - Cache input ArrayBuffer during multi-file selection to eliminate duplicate disk reads on merge
**Learning:** In multi-file PDF tools (such as `js/pdf-merge.js`), reading `await file.arrayBuffer()` separately during thumbnail generation and again during document merging forces duplicate async File/disk reads for every selected file.
**Action:** Read `const arrayBuffer = await file.arrayBuffer()` once during file addition, pass `arrayBuffer.slice(0)` to PDF.js worker tasks for preview rendering, store `arrayBuffer` on item state objects, and reuse `item.arrayBuffer` directly in `PDFLib.PDFDocument.load` operations.

## 2026-09-24 - Prefer native String.prototype.trimEnd() over regex replace for line whitespace trimming
**Learning:** In text normalization pipelines (such as `js/text-to-pdf.js`), calling `.replace(/\s+$/g, "")` inside `.map()` loops on split lines forces JavaScript engines to instantiate regex state machines and execute pattern matching per line. Using native `String.prototype.trimEnd()` performs direct backward string scanning without regex engine overhead.
**Action:** Use native `.trimEnd()` instead of `.replace(/\s+$/g, "")` when trimming trailing line whitespace in string normalization pipelines.

## 2026-09-25 - Hoist constant PDF-lib RGB color object instantiation outside document page iteration loops
**Learning:** In multi-page PDF document generation workflows (such as `js/pdf-page-numbers.js`), creating color objects via `pdfLib.rgb(r, g, b)` inside page loops re-allocates identical `RGB` objects on every page iteration.
**Action:** Instantiate constant `pdfLib.rgb(...)` color objects outside page iteration loops and pass the single color reference to `page.drawText()` or shape drawing commands across all pages.

## 2026-09-26 - Pre-fill solid white background on HTML canvas before JPEG conversion in PDF processing
**Learning:** In HTML canvas rendering pipelines (such as `js/pdf-protect.js`), converting PDF page canvases with default transparent backgrounds directly to JPEG via `canvas.toDataURL("image/jpeg")` causes transparent background pixels to render as solid black in the encoded JPEG output.
**Action:** Always pre-fill canvas 2D contexts with `context.fillStyle = "#ffffff"` and `context.fillRect(0, 0, canvas.width, canvas.height)` before invoking `page.render()` when exporting canvas contents to JPEG.

## 2026-09-27 - Retain ArrayBuffer copies when PDF.js worker transfers and detaches buffers
**Learning:** PDF.js worker tasks transfer and detach `ArrayBuffer` objects passed to `pdfjsLib.getDocument({ data })`. Attempting to omit `.slice(0)` when passing an `ArrayBuffer` that must subsequently be read by `PDFLib.PDFDocument.load()` causes `TypeError: Cannot perform operations on a detached ArrayBuffer` during PDF generation/export.
**Action:** Always pass a cloned slice (`arrayBuffer.slice(0)`) to `pdfjs.getDocument({ data })` whenever the source `ArrayBuffer` needs to be read or processed by another library later in the tool workflow.

## 2026-09-28 - Early exit word scanning in PDF page text analysis
**Learning:** In client-side PDF text extraction (such as `js/pdf-to-text.js`), converting entire page strings to lowercase (`.toLowerCase()`) and running global regex matches (`.match(/\b[a-z]{3,}\b/g)`) allocates large temporary arrays of matching word strings. On standard text-based PDF pages, exiting the word search as soon as 3 English words are encountered avoids full-page string scanning and array allocations.
**Action:** Use a `RegExp.exec()` loop with an early break condition (`while (count < 3 && regex.exec(text))`) when checking minimum word count thresholds during page text analysis.
