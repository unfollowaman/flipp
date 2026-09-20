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

## 2026-09-20 - Use createImageBitmap for dimensions and defer Base64 encoding in image-to-PDF generation
**Learning:** In client-side image-to-PDF conversion (such as `js/img-to-pdf.js`), pre-converting all selected image files to Base64 data URLs via `Promise.all` up-front creates massive simultaneous heap allocations (O(N * file_size)) and redundant Base64 conversions merely to inspect image dimensions (`naturalWidth`/`naturalHeight`).
**Action:** Use `createImageBitmap(blob)` (or existing `blob:` URLs) to read image dimensions without Base64 encoding, and defer `fileToDataUrl(file)` conversion to the sequential PDF page generation loop so Base64 allocations occur per-page on demand (O(1 * file_size)) and can be garbage-collected iteratively.
