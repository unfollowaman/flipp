import { initDropZone, showToast } from "./drag-drop.js";

let pdfFile = null;
let originalPdfBytes = null;
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

const splitNCheckbox = document.getElementById("split-n-checkbox");
const splitNStepper = document.getElementById("split-n-stepper");
const splitNDecBtn = document.getElementById("split-n-dec");
const splitNIncBtn = document.getElementById("split-n-inc");
const splitNInput = document.getElementById("split-n-input");
const splitRangeGroup = document.getElementById("split-range-group");

function toggleNModeUI() {
  const isChecked = splitNCheckbox ? splitNCheckbox.checked : false;
  if (splitNStepper) {
    splitNStepper.style.opacity = isChecked ? "1" : "0.5";
    splitNStepper.style.pointerEvents = isChecked ? "auto" : "none";
  }
  if (splitNDecBtn) splitNDecBtn.disabled = !isChecked;
  if (splitNIncBtn) splitNIncBtn.disabled = !isChecked;
  if (splitNInput) splitNInput.disabled = !isChecked;

  if (splitRangeGroup) {
    splitRangeGroup.style.opacity = isChecked ? "0.4" : "1";
    splitRangeGroup.style.pointerEvents = isChecked ? "none" : "auto";
  }
}

if (splitNCheckbox) {
  splitNCheckbox.addEventListener("change", toggleNModeUI);
}

if (splitNDecBtn && splitNInput) {
  splitNDecBtn.addEventListener("click", () => {
    let val = parseInt(splitNInput.value, 10) || 1;
    if (val > 1) {
      splitNInput.value = val - 1;
    }
  });
}

if (splitNIncBtn && splitNInput) {
  splitNIncBtn.addEventListener("click", () => {
    let val = parseInt(splitNInput.value, 10) || 1;
    splitNInput.value = val + 1;
  });
}

if (splitNInput) {
  splitNInput.addEventListener("input", () => {
    let val = parseInt(splitNInput.value, 10);
    if (isNaN(val) || val < 1) {
      splitNInput.value = 1;
    }
  });
}

const activeRenderTasks = new Map();

async function renderPagePreview(pageNum, container) {
  const currentRequestId = (activeRenderTasks.get(container) || 0) + 1;
  activeRenderTasks.set(container, currentRequestId);

  function updateChip(pNum) {
    let chip = container.querySelector(".split-preview-chip");
    if (!chip) {
      chip = document.createElement("span");
      chip.className = "split-preview-chip";
      container.appendChild(chip);
    }
    const val = pNum !== undefined && pNum !== null ? String(pNum).trim() : "";
    chip.textContent = val ? `Page ${val}` : "Page 1";
  }

  if (!pdfDocument) {
    updateChip(pageNum);
    return;
  }

  const pageNumber = Number(pageNum);
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > totalPages
  ) {
    container.innerHTML = "";
    container.textContent = "No such page 😑";
    updateChip(pageNum);
    return;
  }

  let page = null;
  try {
    page = await pdfDocument.getPage(pageNumber);

    if (activeRenderTasks.get(container) !== currentRequestId) {
      return;
    }

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

    container.innerHTML = "";
    container.appendChild(canvas);
    await page.render(renderContext).promise;
  } catch (error) {
    if (activeRenderTasks.get(container) === currentRequestId) {
      container.textContent = "Error rendering page";
    }
  } finally {
    updateChip(pageNum);
    if (page && typeof page.cleanup === "function") {
      page.cleanup();
    }
  }
}

function resetSplitUIState(file) {
  pdfFile = file;
  originalPdfBytes = null;
  previewArea.classList.add("is-visible");
  resultsArea.classList.remove("is-visible");
  splitBlobs = [];
  downloadsEl.innerHTML = "";
  infoEl.textContent = `Selected: ${file.name} — loading page count…`;
  totalPages = 0;
  rangeStartEl.value = "";
  rangeEndEl.value = "";
  if (splitNCheckbox) splitNCheckbox.checked = false;
  if (splitNInput) splitNInput.value = "1";
  toggleNModeUI();
}

async function loadPdfMetadataAndPreviews(file) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) {
    showToast("PDF library not ready yet.", "error");
    return;
  }

  if (pdfDocument) {
    try {
      await pdfDocument.destroy();
    } catch (e) {
      console.warn("Error destroying PDF document:", e);
    }
    pdfDocument = null;
  }

  try {
    originalPdfBytes = await file.arrayBuffer();
    const srcPdf = await PDFLib.PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
    totalPages = srcPdf.getPageCount();
    infoEl.textContent = `Selected: ${file.name} (${totalPages} pages)`;
    rangeStartEl.min = "1";
    rangeEndEl.min = "1";
    rangeStartEl.max = String(totalPages);
    rangeEndEl.max = String(totalPages);
    rangeStartEl.value = "1";
    rangeEndEl.value = String(Math.max(1, totalPages - 1));

    // Load pdfDocument using pdf.js for rendering previews
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (pdfjsLib) {
      // Pass a copy so pdf.js worker doesn't detach originalPdfBytes
      const bufferCopy = originalPdfBytes.slice(0);
      pdfDocument = await pdfjsLib.getDocument({ data: bufferCopy }).promise;

      // Initial render for previews
      await Promise.all([
        renderPagePreview(rangeStartEl.value, previewStartEl),
        renderPagePreview(rangeEndEl.value, previewEndEl),
      ]);
    }
  } catch (e) {
    console.error(e);
    showToast("Failed to read PDF page count.", "error");
    infoEl.textContent = `Selected: ${file.name}`;
  }
}

function addFiles(files) {
  const first = files.find(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!first) return showToast("Please add a PDF file.", "error");

  resetSplitUIState(first);
  loadPdfMetadataAndPreviews(first);
}

let startInputTimeout = null;
let endInputTimeout = null;

rangeStartEl.addEventListener("input", () => {
  const chip = previewStartEl.querySelector(".split-preview-chip");
  if (chip) {
    const val = rangeStartEl.value.trim();
    chip.textContent = val ? `Page ${val}` : "Page 1";
  }
  if (startInputTimeout) clearTimeout(startInputTimeout);
  startInputTimeout = setTimeout(() => {
    renderPagePreview(rangeStartEl.value, previewStartEl);
  }, 120);
});

rangeEndEl.addEventListener("input", () => {
  const chip = previewEndEl.querySelector(".split-preview-chip");
  if (chip) {
    const val = rangeEndEl.value.trim();
    chip.textContent = val ? `Page ${val}` : "Page 1";
  }
  if (endInputTimeout) clearTimeout(endInputTimeout);
  endInputTimeout = setTimeout(() => {
    renderPagePreview(rangeEndEl.value, previewEndEl);
  }, 120);
});

splitBtn.addEventListener("click", async () => {
  if (!pdfFile || !originalPdfBytes) return;
  const PDFLib = window.PDFLib;
  if (!PDFLib) return showToast("PDF library not ready yet.", "error");

  try {
    const srcPdf = await PDFLib.PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
    totalPages = srcPdf.getPageCount();

    splitBlobs = [];
    const baseName = pdfFile.name.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_");

    const isNMode = splitNCheckbox ? splitNCheckbox.checked : false;

    if (isNMode) {
      const n = parseInt(splitNInput ? splitNInput.value : "1", 10);
      const interval = isNaN(n) || n < 1 ? 1 : n;

      let chunkIndex = 1;
      for (let i = 0; i < totalPages; i += interval) {
        const chunkLength = Math.min(interval, totalPages - i);
        const pageIndexes = Array.from(
          { length: chunkLength },
          (_, idx) => i + idx,
        );

        const outPdf = await PDFLib.PDFDocument.create();
        const copiedPages = await outPdf.copyPages(srcPdf, pageIndexes);
        copiedPages.forEach((page) => outPdf.addPage(page));

        splitBlobs.push({
          name: `${baseName}-part-${chunkIndex}.pdf`,
          blob: new Blob([await outPdf.save()], { type: "application/pdf" }),
        });
        chunkIndex++;
      }

      previewArea.classList.remove("is-visible");
      resultsArea.classList.add("is-visible");
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

      if (splitBlobs.length > 1 && window.JSZip) {
        const zipBtn = document.createElement("button");
        zipBtn.className = "cta-btn cta-mint";
        zipBtn.textContent = "Download All as ZIP 📦";
        zipBtn.addEventListener("click", async () => {
          zipBtn.textContent = "Zipping…";
          zipBtn.disabled = true;
          try {
            const zip = new window.JSZip();
            splitBlobs.forEach((entry) => {
              zip.file(entry.name, entry.blob);
            });
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(zipBlob);
            a.download = `${baseName}-split.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast("ZIP downloaded!");
          } catch (err) {
            console.error(err);
            showToast("Failed to create ZIP file.", "error");
          } finally {
            zipBtn.textContent = "Download All as ZIP 📦";
            zipBtn.disabled = false;
          }
        });
        downloadsEl.appendChild(zipBtn);
      }

      showToast(`Split into ${splitBlobs.length} PDF file${splitBlobs.length !== 1 ? "s" : ""}.`);
    } else {
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

      previewArea.classList.remove("is-visible");
      resultsArea.classList.add("is-visible");
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
    }
  } catch (error) {
    console.error(error);
    showToast("Error loading PDF.", "error");
    resetBtn.click();
  }
});

resetBtn.addEventListener("click", () => {
  if (pdfDocument) {
    try {
      pdfDocument.destroy();
    } catch (e) {
      console.warn("Error destroying PDF document:", e);
    }
    pdfDocument = null;
  }
  pdfFile = null;
  originalPdfBytes = null;
  splitBlobs = [];
  totalPages = 0;
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  infoEl.textContent = "";
  downloadsEl.innerHTML = "";
  rangeStartEl.value = "";
  rangeEndEl.value = "";
  previewStartEl.innerHTML = "";
  previewEndEl.innerHTML = "";
  if (splitNCheckbox) splitNCheckbox.checked = false;
  if (splitNInput) splitNInput.value = "1";
  toggleNModeUI();
});

initDropZone(dropZoneEl, fileInputEl, addFiles);
