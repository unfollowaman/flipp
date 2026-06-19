import { initDropZone, showToast } from "./drag-drop.js";

let pdfFile = null;
let splitBlobs = [];
let totalPages = 0;
let pdfDocument = null; // Holds the pdf.js document for rendering previews

const dropZoneEl = document.getElementById("split-drop-zone");
const fileInputEl = document.getElementById("split-file-input");
const previewArea = document.getElementById("split-preview-area");
const infoEl = document.getElementById("split-info");
const splitBtn = document.getElementById("split-btn");
const resultsArea = document.getElementById("split-results");
const downloadsEl = document.getElementById("split-downloads");
const resetBtn = document.getElementById("split-reset-btn");
const rangeStartEl = document.getElementById("split-range-start");
const rangeEndEl = document.getElementById("split-range-end");
const previewStartEl = document.getElementById("split-preview-start");
const previewEndEl = document.getElementById("split-preview-end");

async function renderPagePreview(pageNum, container) {
  container.innerHTML = ""; // Clear previous content

  if (!pdfDocument) return;

  const pageNumber = Number(pageNum);
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > totalPages
  ) {
    container.textContent = "No such page 😑";
    return;
  }

  try {
    const page = await pdfDocument.getPage(pageNumber);
    const scale = 0.5; // Adjust scale as needed to fit the container roughly
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Scale canvas CSS to fit inside the fixed 160px container
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "100%";
    canvas.style.objectFit = "contain";

    const ctx = canvas.getContext("2d");

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    container.appendChild(canvas);
    await page.render(renderContext).promise;
  } catch (error) {
    console.error("Error rendering page:", error);
    container.textContent = "Error rendering page";
  }
}

function addFiles(files) {
  const first = files.find(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!first) return showToast("Please add a PDF file.", "error");
  pdfFile = first;
  previewArea.style.display = "block";
  resultsArea.style.display = "none";
  splitBlobs = [];
  downloadsEl.innerHTML = "";
  infoEl.textContent = `Selected: ${first.name} — loading page count…`;
  totalPages = 0;
  rangeStartEl.value = "";
  rangeEndEl.value = "";

  const PDFLib = window.PDFLib;
  if (!PDFLib) {
    showToast("PDF library not ready yet.", "error");
    return;
  }

  (async () => {
    try {
      const arrayBuffer = await first.arrayBuffer();
      const srcPdf = await PDFLib.PDFDocument.load(arrayBuffer);
      totalPages = srcPdf.getPageCount();
      infoEl.textContent = `Selected: ${first.name} (${totalPages} pages)`;
      rangeStartEl.min = "1";
      rangeEndEl.min = "1";
      rangeStartEl.max = String(totalPages);
      rangeEndEl.max = String(totalPages);
      rangeStartEl.value = "1";
      rangeEndEl.value = String(Math.max(1, totalPages - 1));

      // Load pdfDocument using pdf.js for rendering previews
      const pdfjsLib = window["pdfjs-dist/build/pdf"];
      if (pdfjsLib) {
        // Create a copy of the buffer because pdfLib might have modified/consumed it
        const bufferCopy = arrayBuffer.slice(0);
        pdfDocument = await pdfjsLib.getDocument({ data: bufferCopy }).promise;

        // Initial render for previews
        await renderPagePreview(rangeStartEl.value, previewStartEl);
        await renderPagePreview(rangeEndEl.value, previewEndEl);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to read PDF page count.", "error");
      infoEl.textContent = `Selected: ${first.name}`;
    }
  })();
}

rangeStartEl.addEventListener("input", () => {
  renderPagePreview(rangeStartEl.value, previewStartEl);
});

rangeEndEl.addEventListener("input", () => {
  renderPagePreview(rangeEndEl.value, previewEndEl);
});

splitBtn.addEventListener("click", async () => {
  if (!pdfFile) return;
  const PDFLib = window.PDFLib;
  if (!PDFLib) return showToast("PDF library not ready yet.", "error");

  const srcPdf = await PDFLib.PDFDocument.load(await pdfFile.arrayBuffer());
  totalPages = srcPdf.getPageCount();
  if (totalPages < 2)
    return showToast("PDF needs at least 2 pages to split.", "error");

  const start = Number(rangeStartEl.value);
  const end = Number(rangeEndEl.value);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return showToast("Enter valid page numbers.", "error");
  }
  if (
    start < 1 ||
    end < 1 ||
    start > totalPages ||
    end > totalPages ||
    start > end
  ) {
    return showToast(
      `Choose a valid range between 1 and ${totalPages}.`,
      "error",
    );
  }
  if (end >= totalPages) {
    return showToast(
      "End page must be before the last page so second file is not empty.",
      "error",
    );
  }

  splitBlobs = [];
  const baseName = pdfFile.name.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_");

  const firstOut = await PDFLib.PDFDocument.create();
  const firstPageIndexes = Array.from(
    { length: end - start + 1 },
    (_, i) => start - 1 + i,
  );
  const firstPages = await firstOut.copyPages(srcPdf, firstPageIndexes);
  firstPages.forEach((page) => firstOut.addPage(page));
  splitBlobs.push({
    name: `${baseName} 1.pdf`,
    blob: new Blob([await firstOut.save()], { type: "application/pdf" }),
  });

  const secondOut = await PDFLib.PDFDocument.create();
  const secondPageIndexes = Array.from(
    { length: totalPages - end },
    (_, i) => end + i,
  );
  const secondPages = await secondOut.copyPages(srcPdf, secondPageIndexes);
  secondPages.forEach((page) => secondOut.addPage(page));
  splitBlobs.push({
    name: `${baseName} 2.pdf`,
    blob: new Blob([await secondOut.save()], { type: "application/pdf" }),
  });

  previewArea.style.display = "none";
  resultsArea.style.display = "block";
  downloadsEl.innerHTML = "";
  splitBlobs.forEach((entry) => {
    const btn = document.createElement("button");
    btn.className = "cta-btn cta-yellow";
    btn.textContent = `Download ${entry.name}`;
    btn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(entry.blob);
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    downloadsEl.appendChild(btn);
  });

  showToast(
    `Split into 2 PDFs: pages ${start}-${end} and ${end + 1}-${totalPages}.`,
  );
});

resetBtn.addEventListener("click", () => {
  pdfFile = null;
  splitBlobs = [];
  totalPages = 0;
  pdfDocument = null;
  previewArea.style.display = "none";
  resultsArea.style.display = "none";
  infoEl.textContent = "";
  downloadsEl.innerHTML = "";
  rangeStartEl.value = "";
  rangeEndEl.value = "";
  previewStartEl.innerHTML = "";
  previewEndEl.innerHTML = "";
});

initDropZone(dropZoneEl, fileInputEl, addFiles);
