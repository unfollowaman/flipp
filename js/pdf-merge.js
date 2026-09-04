import { initDropZone, showToast, setupDragReorder, renderPageToDataUrl } from "./drag-drop.js";

let pdfItems = [];
let mergedBlob = null;

const dropZoneEl = document.getElementById("merge-drop-zone");
const fileInputEl = document.getElementById("merge-file-input");
const previewArea = document.getElementById("merge-preview-area");
const gridEl = document.getElementById("merge-file-grid");
const countEl = document.getElementById("merge-file-count");
const addMoreBtn = document.getElementById("merge-add-more-btn");
const mergeBtn = document.getElementById("merge-btn");
const resultsArea = document.getElementById("merge-results");
const downloadBtn = document.getElementById("merge-download-btn");
const resetBtn = document.getElementById("merge-reset-btn");

if (addMoreBtn) {
  addMoreBtn.addEventListener("click", () => fileInputEl.click());
}

async function renderPdfFirstPage(file) {
  try {
    const pdfjs = window["pdfjs-dist/build/pdf"];
    if (!pdfjs) return null;

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) })
      .promise;
    if (pdfDoc.numPages < 1) return null;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.3 });
    return await renderPageToDataUrl(page, viewport);
  } catch (err) {
    console.error("Thumbnail rendering error for", file.name, err);
    return null;
  }
}

async function addFiles(files) {
  const valid = files.filter(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!valid.length) return showToast("Please add PDF files only.", "error");

  const newItems = await Promise.all(
    valid.map(async (file) => {
      const thumbnailDataUrl = await renderPdfFirstPage(file);
      return {
        file,
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        thumbnailDataUrl,
      };
    }),
  );

  pdfItems = [...pdfItems, ...newItems];
  renderPreview();
}

function createThumbnailCard(item, idx) {
  const card = document.createElement("div");
  card.className = "img-thumb-card";
  card.draggable = true;
  card.dataset.idx = idx;

  const num = document.createElement("div");
  num.className = "img-thumb-num";
  num.textContent = idx + 1;
  card.appendChild(num);

  if (item.thumbnailDataUrl) {
    const img = document.createElement("img");
    img.src = item.thumbnailDataUrl;
    img.loading = "lazy";
    img.alt = item.file.name;
    card.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.cssText =
      "height: 120px; display: flex; align-items: center; justify-content: center; background: var(--cream, #fdfbf7); font-size: 32px; font-weight: bold; color: var(--black, #000); border-bottom: 1px solid var(--black, #000);";
    placeholder.textContent = "📄";
    card.appendChild(placeholder);
  }

  const lbl = document.createElement("div");
  lbl.className = "img-thumb-label";
  lbl.textContent = item.file.name;
  lbl.title = item.file.name;
  card.appendChild(lbl);

  const rmBtn = document.createElement("button");
  rmBtn.className = "img-thumb-remove";
  rmBtn.textContent = "✕";
  rmBtn.title = `Remove ${item.file.name}`;
  rmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const currentIdx = pdfItems.findIndex((it) => it.id === item.id);
    if (currentIdx !== -1) {
      pdfItems.splice(currentIdx, 1);
    }
    if (pdfItems.length === 0) {
      resetMerge();
    } else {
      renderPreview();
    }
  });
  card.appendChild(rmBtn);

  setupDragReorder(card, updatePdfOrder);
  return card;
}

function updatePdfOrder() {
  if (!gridEl) return;
  const allCards = Array.from(gridEl.querySelectorAll(".img-thumb-card"));
  const newPdfItems = [];

  allCards.forEach((card, index) => {
    const oldIdx = parseInt(card.dataset.idx, 10);
    if (pdfItems[oldIdx]) {
      newPdfItems.push(pdfItems[oldIdx]);
    }
    card.dataset.idx = index;
    const numEl = card.querySelector(".img-thumb-num");
    if (numEl) numEl.textContent = index + 1;
  });

  pdfItems = newPdfItems;
}

function renderPreview() {
  previewArea.classList.add("is-visible");
  resultsArea.classList.remove("is-visible");
  if (gridEl) gridEl.innerHTML = "";

  countEl.textContent = `${pdfItems.length} PDF${pdfItems.length !== 1 ? "s" : ""} selected`;

  const fragment = document.createDocumentFragment();
  pdfItems.forEach((item, idx) => {
    const card = createThumbnailCard(item, idx);
    fragment.appendChild(card);
  });

  if (gridEl) gridEl.appendChild(fragment);
}

mergeBtn.addEventListener("click", async () => {
  if (pdfItems.length < 2)
    return showToast("Add at least 2 PDFs to merge.", "error");
  const PDFLib = window.PDFLib;
  if (!PDFLib) return showToast("PDF library not ready yet.", "error");

  mergeBtn.disabled = true;
  mergeBtn.textContent = "Merging...";

  // Yield the main thread to allow the browser to paint the button state changes
  await new Promise((r) => setTimeout(r, 50));

  try {
    const outPdf = await PDFLib.PDFDocument.create();

    const loadedPdfs = await Promise.all(
      pdfItems.map(async (item) => {
        const srcBytes = await item.file.arrayBuffer();
        return PDFLib.PDFDocument.load(srcBytes, {
          ignoreEncryption: true,
        });
      }),
    );

    for (const srcPdf of loadedPdfs) {
      const pages = await outPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      pages.forEach((p) => outPdf.addPage(p));
    }

    const bytes = await outPdf.save();
    mergedBlob = new Blob([bytes], { type: "application/pdf" });
    previewArea.classList.remove("is-visible");
    resultsArea.classList.add("is-visible");
    showToast("Merged PDF is ready!");
  } catch (error) {
    console.error("Error merging PDFs:", error);
    showToast(
      "Failed to merge PDFs. Ensure files are valid and not password protected.",
      "error",
    );
  } finally {
    mergeBtn.disabled = false;
    mergeBtn.textContent = "Merge PDFs →";
  }
});

downloadBtn.addEventListener("click", () => {
  if (!mergedBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(mergedBlob);
  a.download = "merged.pdf";
  a.click();
  URL.revokeObjectURL(a.href);
});

function resetMerge() {
  pdfItems = [];
  mergedBlob = null;
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  if (gridEl) gridEl.innerHTML = "";
  countEl.textContent = "";
}

resetBtn.addEventListener("click", resetMerge);

initDropZone(dropZoneEl, fileInputEl, addFiles);
