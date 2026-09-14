## 2025-09-13 - Release PDF.js page and document resources in PDF processing loops
**Learning:** In Flipp's client-side architecture, PDF.js retains page fonts, canvas backings, and internal worker streams in memory during text extraction and rendering tasks. Not invoking `page.cleanup()` or `pdfDoc.destroy()` causes accumulated memory overhead on large multi-page PDFs.
**Action:** Always call `page.cleanup()` in a `try...finally` block inside page processing loops, and call `await pdfDoc.destroy()` in a top-level `finally` block when completing or catching errors in PDF processing workflows.

## 2026-09-14 - Avoid redundant ArrayBuffer cloning when passing buffers to PDF.js getDocument
**Learning:** In Flipp's client-side file processing pipeline, calling `.slice(0)` on an `ArrayBuffer` before passing it to `pdfjsLib.getDocument()` duplicates the entire file's byte array in RAM, doubling peak memory consumption without functional benefit when the buffer is not accessed again.
**Action:** Pass `arrayBuffer` directly to `pdfjsLib.getDocument(arrayBuffer)` unless the raw array buffer is explicitly mutated or re-used concurrently by another library (e.g., PDF-lib).
