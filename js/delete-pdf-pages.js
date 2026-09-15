import {
  initDropZone,
  showToast,
  setProgress,
  setupDragReorder,
  renderPageToDataUrl,
} from "./drag-drop.js";

let originalPdfFile = null;
let originalPdfBytes = null;
let pagesOrder = [];
let cleanedBlob = null;
let pdfDocument = null;

const dropZoneEl = document.getElementById("delete-drop-zone");
const fileInputEl = document.getElementById("delete-file-input");
const progressArea = document.getElementById("delete-progress");
const progressBar = document.getElementById("delete-progress-bar");
const progressLabel = document.getElementById("delete-progress-label");
const previewArea = document.getElementById("delete-preview-area");
const previewGrid = document.getElementById("delete-preview-grid");
const countEl = document.getElementById("delete-file-count");
const deleteBtn = document.getElementById("delete-btn");
const resultsArea = document.getElementById("delete-results");
const downloadBtn = document.getElementById("delete-download-btn");
const resetBtn = document.getElementById("delete-reset-btn");

function handleFiles(files) {
  if (!files || !files.length) return;
  const valid = files.filter(
    (f) =>
      f && (f.type === "application/pdf" || (f.name && f.name.toLowerCase().endsWith(".pdf"))),
  );
  if (!valid.length) return showToast("Please select a PDF file.", "error");

  if (originalPdfFile) {
    showToast("You can only process one PDF at a time. Resetting...", "error");
  }

  originalPdfFile = valid[0];
  loadPdfAndRenderThumbnails();
}

async function loadPdfDocument() {
  if (pdfDocument && typeof pdfDocument.destroy === "function") {
    try {
      await pdfDocument.destroy();
    } catch (_) {
      // Ignore destruction errors
    }
    pdfDocument = null;
  }

  originalPdfBytes = await originalPdfFile.arrayBuffer();

  const pdfjs = window["pdfjs-dist/build/pdf"];
  if (!pdfjs) throw new Error("PDF.js not loaded.");

  pdfDocument = await pdfjs.getDocument({ data: originalPdfBytes.slice(0) })
    .promise;
  const numPages = pdfDocument.numPages;
  pagesOrder = Array.from({ length: numPages }, (_, i) => i);

  return numPages;
}

function createThumbnailCard(dataUrl, i) {
  const card = document.createElement("div");
  card.className = "img-thumb-card";
  card.draggable = true;
  card.dataset.idx = i - 1; // 0-based original index

  const num = document.createElement("div");
  num.className = "img-thumb-num";
  num.textContent = i;
  card.appendChild(num);

  const img = document.createElement("img");
  img.src = dataUrl;
  img.loading = "lazy";
  img.alt = `Page ${i}`;
  card.appendChild(img);

  const lbl = document.createElement("div");
  lbl.className = "img-thumb-label";
  lbl.textContent = `Page ${i}`;
  card.appendChild(lbl);

  const rmBtn = document.createElement("button");
  rmBtn.className = "img-thumb-remove";
  rmBtn.textContent = "✕";
  rmBtn.title = "Delete page";
  rmBtn.setAttribute("aria-label", `Delete page ${i}`);
  rmBtn.onclick = (e) => {
    e.stopPropagation();
    card.remove();
    updatePagesOrder();
  };
  card.appendChild(rmBtn);

  setupDragReorder(card, updatePagesOrder);
  return card;
}

async function renderThumbnails(numPages) {
  previewGrid.innerHTML = "";
  countEl.textContent = `${numPages} page${numPages !== 1 ? "s" : ""}`;

  const fragment = document.createDocumentFragment();
  const BATCH_SIZE = 5;

  for (let startIdx = 1; startIdx <= numPages; startIdx += BATCH_SIZE) {
    if (numPages > 20) {
      setProgress(
        progressBar,
        progressLabel,
        Math.round((startIdx / numPages) * 100),
        `Rendering pages ${startIdx}-${Math.min(startIdx + BATCH_SIZE - 1, numPages)} of ${numPages}...`,
      );
      await new Promise((r) => setTimeout(r, 0));
    }

    const batchPromises = [];
    for (let i = startIdx; i < startIdx + BATCH_SIZE && i <= numPages; i++) {
      batchPromises.push(
        (async () => {
          let page = null;
          try {
            page = await pdfDocument.getPage(i);
            const scale = 0.3;
            const viewport = page.getViewport({ scale });
            const dataUrl = await renderPageToDataUrl(page, viewport);

            return { dataUrl, i };
          } finally {
            if (page && typeof page.cleanup === "function") {
              page.cleanup();
            }
          }
        })(),
      );
    }

    const results = await Promise.all(batchPromises);

    for (const res of results) {
      const card = createThumbnailCard(res.dataUrl, res.i);
      fragment.appendChild(card);
    }
  }

  previewGrid.appendChild(fragment);
}

async function loadPdfAndRenderThumbnails() {
  dropZoneEl.style.display = "none";
  progressArea.style.display = "block";
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");

  setProgress(progressBar, progressLabel, 0, "Loading PDF...");

  try {
    const numPages = await loadPdfDocument();
    await renderThumbnails(numPages);

    progressArea.style.display = "none";
    previewArea.classList.add("is-visible");
  } catch (error) {
    showToast("Error loading PDF.", "error");
    resetDelete();
  }
}

// ── Update Remaining Pages State ───────────────────────
function updatePagesOrder() {
  const allCards = Array.from(previewGrid.querySelectorAll(".img-thumb-card"));
  pagesOrder = allCards.map((card) => parseInt(card.dataset.idx, 10));

  if (allCards.length === 0) {
    countEl.textContent = "0 pages (At least 1 page required)";
  } else {
    countEl.textContent = `${allCards.length} page${allCards.length !== 1 ? "s" : ""}`;
  }

  // Update displayed page numbers and accessible labels
  allCards.forEach((card, index) => {
    const num = card.querySelector(".img-thumb-num");
    const lbl = card.querySelector(".img-thumb-label");
    const rmBtn = card.querySelector(".img-thumb-remove");
    num.textContent = index + 1;
    lbl.textContent = `Page ${index + 1}`;
    if (rmBtn) {
      rmBtn.setAttribute("aria-label", `Delete page ${index + 1}`);
    }
  });
}

// ── Export Cleaned PDF ────────────────────────────────
deleteBtn.addEventListener("click", async () => {
  if (!originalPdfBytes) return;

  if (!pagesOrder.length) {
    return showToast("At least one page must remain in the PDF.", "error");
  }

  const PDFLib = window.PDFLib;
  if (!PDFLib) return showToast("PDF library not ready yet.", "error");

  previewArea.classList.remove("is-visible");
  progressArea.style.display = "block";
  setProgress(progressBar, progressLabel, 0, "Generating cleaned PDF...");

  try {
    const outPdf = await PDFLib.PDFDocument.create();
    const srcPdf = await PDFLib.PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });

    const copiedPages = await outPdf.copyPages(srcPdf, pagesOrder);
    copiedPages.forEach((page) => outPdf.addPage(page));

    const bytes = await outPdf.save();
    cleanedBlob = new Blob([bytes], { type: "application/pdf" });

    progressArea.style.display = "none";
    resultsArea.classList.add("is-visible");
    showToast("PDF pages deleted successfully!");
  } catch (err) {
    showToast("Failed to compile cleaned PDF.", "error");
    resetDelete();
  }
});

// ── Download ───────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  if (!cleanedBlob) return;

  const originalName = originalPdfFile ? originalPdfFile.name : "document.pdf";
  const newName =
    originalName.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_") +
    "-cleaned.pdf";

  const a = document.createElement("a");
  a.href = URL.createObjectURL(cleanedBlob);
  a.download = newName;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Reset ──────────────────────────────────────────────
resetBtn.addEventListener("click", resetDelete);

function resetDelete() {
  if (pdfDocument && typeof pdfDocument.destroy === "function") {
    try {
      pdfDocument.destroy();
    } catch (_) {
      // Ignore destruction errors
    }
  }

  originalPdfFile = null;
  originalPdfBytes = null;
  pagesOrder = [];
  cleanedBlob = null;
  pdfDocument = null;

  dropZoneEl.style.display = "block";
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  progressArea.style.display = "none";
  previewGrid.innerHTML = "";
  countEl.textContent = "";
  setProgress(progressBar, progressLabel, 0, "");
}

initDropZone(dropZoneEl, fileInputEl, handleFiles);
