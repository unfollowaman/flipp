import { initDropZone, showToast, setupDragReorder, renderPdfFirstPage, fileToDataUrl } from "./drag-drop.js";

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

async function getPdfPageCount(arrayBuffer) {
  if (!arrayBuffer) return 1;
  try {
    const PDFLib = window.PDFLib;
    if (PDFLib && typeof PDFLib.PDFDocument?.load === "function") {
      const doc = await PDFLib.PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
      if (typeof doc.getPageCount === "function") {
        return doc.getPageCount();
      }
      if (typeof doc.getPageIndices === "function") {
        return doc.getPageIndices().length;
      }
      if (typeof doc.numPages === "number") {
        return doc.numPages;
      }
      return 1;
    }
    const pdfjs = window["pdfjs-dist/build/pdf"];
    if (pdfjs && typeof pdfjs.getDocument === "function") {
      const doc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const count = doc.numPages || (typeof doc.getPageIndices === "function" ? doc.getPageIndices().length : 1);
      if (typeof doc.destroy === "function") {
        try { await doc.destroy(); } catch (_) {}
      }
      return count;
    }
  } catch (err) {
    console.warn("Failed to extract PDF page count:", err);
    return null;
  }
  return 1;
}

async function imageFileToPdfArrayBuffer(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const PDFLib = window.PDFLib;
    if (PDFLib && typeof PDFLib.PDFDocument?.create === "function") {
      const doc = await PDFLib.PDFDocument.create();
      let img;
      const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
      if (isPng) {
        img = await doc.embedPng(arrayBuffer);
      } else {
        img = await doc.embedJpg(arrayBuffer);
      }
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const bytes = await doc.save();
      return bytes.buffer;
    }
  } catch (err) {
    console.warn("PDFLib image embedding failed, trying fallback:", err);
  }

  try {
    const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (jsPDF) {
      const dataUrl = await fileToDataUrl(file);
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = dataUrl;
      });
      const w = img.naturalWidth || 600;
      const h = img.naturalHeight || 800;
      const pdf = new jsPDF({
        orientation: w > h ? "landscape" : "portrait",
        unit: "px",
        format: [w, h],
      });
      const format = file.type === "image/png" ? "PNG" : "JPEG";
      pdf.addImage(dataUrl, format, 0, 0, w, h);
      return pdf.output("arraybuffer");
    }
  } catch (e) {
    console.warn("Image to PDF conversion fallback failed:", e);
  }
  return null;
}

async function addFiles(files) {
  const isPdf = (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  const isImg = (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name);

  const valid = files.filter((f) => isPdf(f) || isImg(f));
  if (!valid.length) return showToast("Please add PDF or image files only.", "error");

  const newItems = await Promise.all(
    valid.map(async (file) => {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      if (isPdf(file)) {
        let arrayBuffer = null;
        let thumbnailDataUrl = null;
        let pageCount = "loading";
        let isError = false;

        try {
          arrayBuffer = await file.arrayBuffer();
          thumbnailDataUrl = await renderPdfFirstPage(arrayBuffer);
          const extractedCount = await getPdfPageCount(arrayBuffer);
          if (extractedCount !== null && extractedCount !== undefined && extractedCount > 0) {
            pageCount = extractedCount;
          } else {
            isError = true;
            pageCount = "error";
          }
        } catch (e) {
          console.error("Error reading PDF file:", e);
          isError = true;
          pageCount = "error";
        }

        return {
          file,
          arrayBuffer,
          id,
          thumbnailDataUrl,
          pageCount,
          type: "pdf",
          isError,
        };
      } else {
        let arrayBuffer = null;
        let thumbnailDataUrl = null;

        try {
          thumbnailDataUrl = await fileToDataUrl(file);
          arrayBuffer = await imageFileToPdfArrayBuffer(file);
        } catch (e) {
          console.error("Error converting image:", e);
        }

        return {
          file,
          arrayBuffer,
          id,
          thumbnailDataUrl,
          pageCount: 1,
          type: "image",
          isError: false,
        };
      }
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

  const nameEl = document.createElement("div");
  nameEl.className = "img-thumb-name";
  nameEl.textContent = item.file.name;
  nameEl.title = item.file.name;
  lbl.appendChild(nameEl);

  const pagesEl = document.createElement("div");
  pagesEl.className = "img-thumb-page-count";
  if (item.pageCount === "loading") {
    pagesEl.textContent = "Loading pages...";
    pagesEl.classList.add("is-loading");
  } else if (item.pageCount === "error" || item.isError) {
    pagesEl.textContent = "Invalid PDF";
    pagesEl.classList.add("is-error");
  } else if (typeof item.pageCount === "number") {
    pagesEl.textContent = `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`;
  } else {
    pagesEl.textContent = "";
  }
  lbl.appendChild(pagesEl);

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

function createAddMoreCard() {
  const card = document.createElement("div");
  card.className = "img-add-more-card";
  card.id = "merge-add-more-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", "Add more PDF or image files");

  const icon = document.createElement("div");
  icon.className = "img-add-more-icon";
  icon.textContent = "+";
  card.appendChild(icon);

  const title = document.createElement("div");
  title.className = "img-add-more-title";
  title.textContent = "Add more files";
  card.appendChild(title);

  const sub = document.createElement("div");
  sub.className = "img-add-more-subtitle";
  sub.textContent = "Add PDF or image files";
  card.appendChild(sub);

  card.addEventListener("click", () => {
    if (fileInputEl) fileInputEl.click();
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (fileInputEl) fileInputEl.click();
    }
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    card.classList.add("drag-over");
  });

  card.addEventListener("dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove("drag-over");
    }
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  });

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

  countEl.textContent = `${pdfItems.length} file${pdfItems.length !== 1 ? "s" : ""} selected`;

  const fragment = document.createDocumentFragment();
  pdfItems.forEach((item, idx) => {
    const card = createThumbnailCard(item, idx);
    fragment.appendChild(card);
  });

  const addMoreCard = createAddMoreCard();
  fragment.appendChild(addMoreCard);

  if (gridEl) gridEl.appendChild(fragment);

  if (mergeBtn) {
    if (pdfItems.length < 2) {
      mergeBtn.disabled = true;
      mergeBtn.title = "Add at least 2 PDFs to merge";
    } else {
      mergeBtn.disabled = false;
      mergeBtn.title = "";
    }
  }
}

mergeBtn.addEventListener("click", async () => {
  if (pdfItems.length < 2)
    return showToast("Add at least 2 PDFs to merge.", "error");

  const invalidItem = pdfItems.find((it) => it.isError || it.pageCount === "error");
  if (invalidItem) {
    return showToast("Please remove invalid or unreadable files before merging.", "error");
  }

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
        let srcBytes = item.arrayBuffer;
        if (!srcBytes && item.file) {
          srcBytes = await item.file.arrayBuffer();
        }
        return PDFLib.PDFDocument.load(srcBytes, {
          ignoreEncryption: true,
        });
      }),
    );

    const pagesList = await Promise.all(
      loadedPdfs.map((srcPdf) =>
        outPdf.copyPages(srcPdf, srcPdf.getPageIndices()),
      ),
    );
    pagesList.forEach((pages) => pages.forEach((p) => outPdf.addPage(p)));

    const bytes = await outPdf.save();
    mergedBlob = new Blob([bytes], { type: "application/pdf" });
    renderFinalStageUI();
    showToast("Merged PDF is ready!");
  } catch (error) {
    console.error("Error merging PDFs:", error);
    showToast(
      "Failed to merge PDFs. Ensure files are valid and not password protected.",
      "error",
    );
  } finally {
    mergeBtn.disabled = pdfItems.length < 2;
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

function renderFinalStageUI() {
  if (dropZoneEl) dropZoneEl.style.display = "none";
  if (previewArea) previewArea.classList.remove("is-visible");
  if (resultsArea) resultsArea.classList.add("is-visible");

  const sourcesGridEl = document.getElementById("merged-sources-grid");
  const masterPreviewEl = document.getElementById("merged-master-preview");

  if (sourcesGridEl) {
    sourcesGridEl.innerHTML = "";
    pdfItems.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "merged-source-card";

      const numBadge = document.createElement("div");
      numBadge.className = "merged-source-num";
      numBadge.textContent = idx + 1;
      card.appendChild(numBadge);

      if (item.thumbnailDataUrl) {
        const img = document.createElement("img");
        img.src = item.thumbnailDataUrl;
        img.alt = item.file.name;
        img.className = "merged-source-img";
        card.appendChild(img);
      } else {
        const icon = document.createElement("div");
        icon.className = "merged-source-icon";
        icon.textContent = "📄";
        card.appendChild(icon);
      }

      const label = document.createElement("div");
      label.className = "merged-source-label";
      label.textContent = item.file.name;
      label.title = item.file.name;
      card.appendChild(label);

      sourcesGridEl.appendChild(card);
    });
  }

  if (masterPreviewEl && pdfItems.length > 0 && pdfItems[0].thumbnailDataUrl) {
    masterPreviewEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = pdfItems[0].thumbnailDataUrl;
    img.alt = "Merged PDF preview";
    img.className = "merged-master-img";
    masterPreviewEl.appendChild(img);
  }

  setTimeout(updateConnectorLines, 50);
  setTimeout(updateConnectorLines, 300);
}

function updateConnectorLines() {
  const container = document.getElementById("merged-stage-container");
  const svg = document.getElementById("merge-connector-svg");
  const masterCard = document.getElementById("merged-master-card");
  const wrapper = document.getElementById("merge-connector-wrapper");
  if (!container || !svg || !masterCard || !wrapper) return;

  const sourceCards = Array.from(container.querySelectorAll(".merged-source-card"));
  if (!sourceCards.length) return;

  if (
    typeof container.getBoundingClientRect !== "function" ||
    typeof wrapper.getBoundingClientRect !== "function" ||
    typeof masterCard.getBoundingClientRect !== "function"
  ) {
    return;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const masterRect = masterCard.getBoundingClientRect();

  if (wrapperRect.width === 0 || wrapperRect.height === 0) {
    return;
  }

  svg.setAttribute("width", wrapperRect.width);
  svg.setAttribute("height", wrapperRect.height);
  svg.setAttribute("viewBox", `0 0 ${wrapperRect.width} ${wrapperRect.height}`);

  const targetX = masterRect.left + masterRect.width / 2 - wrapperRect.left;
  const targetY = masterRect.top - wrapperRect.top;

  let pathsHtml = "";
  sourceCards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const startX = cardRect.left + cardRect.width / 2 - wrapperRect.left;
    const startY = cardRect.top + cardRect.height - wrapperRect.top;

    const midY = (startY + targetY) / 2;
    const pathData = `M ${startX} ${startY} C ${startX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;
    pathsHtml += `<path d="${pathData}" stroke="#3dd68c" stroke-width="3" stroke-dasharray="6,6" fill="none" stroke-linecap="round" />`;
  });

  svg.innerHTML = pathsHtml;
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("resize", updateConnectorLines);
}

function resetMerge() {
  pdfItems = [];
  mergedBlob = null;
  if (dropZoneEl) dropZoneEl.style.display = "";
  if (previewArea) previewArea.classList.remove("is-visible");
  if (resultsArea) resultsArea.classList.remove("is-visible");
  if (gridEl) gridEl.innerHTML = "";
  if (countEl) countEl.textContent = "";

  const sourcesGridEl = document.getElementById("merged-sources-grid");
  const connectorSvgEl = document.getElementById("merge-connector-svg");
  if (sourcesGridEl) sourcesGridEl.innerHTML = "";
  if (connectorSvgEl) connectorSvgEl.innerHTML = "";
}

resetBtn.addEventListener("click", resetMerge);

initDropZone(dropZoneEl, fileInputEl, addFiles);
