## 2025-09-13 - Release PDF.js page and document resources in PDF processing loops
**Learning:** In Flipp's client-side architecture, PDF.js retains page fonts, canvas backings, and internal worker streams in memory during text extraction and rendering tasks. Not invoking `page.cleanup()` or `pdfDoc.destroy()` causes accumulated memory overhead on large multi-page PDFs.
**Action:** Always call `page.cleanup()` in a `try...finally` block inside page processing loops, and call `await pdfDoc.destroy()` in a top-level `finally` block when completing or catching errors in PDF processing workflows.
