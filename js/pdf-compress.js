import { initDropZone, showToast } from "./drag-drop.js";

let selectedFile = null;
let currentDownloadUrl = null;
let currentOutputFilename = "";

const dropZone = document.getElementById("compress-drop-zone");
const fileInput = document.getElementById("compress-file-input");
const previewArea = document.getElementById("compress-preview-area");
const resultsArea = document.getElementById("compress-results");
const compressBtn = document.getElementById("compress-btn");
const resetBtn = document.getElementById("compress-reset-btn");
const downloadsDiv = document.getElementById("compress-downloads");

const fileChipName = document.getElementById("compress-file-chip-name");
const fileChipSize = document.getElementById("compress-file-chip-size");

const progressContainer = document.getElementById(
  "compress-progress-container",
);
const progressText = document.getElementById("compress-progress-text");

const resultSavings = document.getElementById("compress-result-savings");
const sizeBarUsed = document.getElementById("compress-size-bar-used");
const sizeBarOrig = document.getElementById("compress-size-bar-orig");
const sizeBarCurr = document.getElementById("compress-size-bar-curr");
const downloadBtn = document.getElementById("compress-download-btn");
const downloadFilename = document.getElementById("compress-download-filename");

const modeCards = document.querySelectorAll
  ? document.querySelectorAll(".compress-mode-card")
  : [];

/**
 * Maps items concurrently with a maximum concurrency limit.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapConcurrent(items, limit, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = new Array(workerCount);
  for (let i = 0; i < workerCount; i++) {
    workers[i] = worker();
  }

  await Promise.all(workers);
  return results;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

modeCards.forEach((card) => {
  card.addEventListener("click", () => {
    modeCards.forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
  });
});

initDropZone(dropZone, fileInput, (files) => {
  if (!files.length) return;
  const file = files[0];
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showToast("Please select a valid PDF file.", "error");
    return;
  }
  selectedFile = file;
  dropZone.style.display = "none";
  previewArea.classList.add("is-visible");
  if (fileChipName) fileChipName.textContent = file.name;
  if (fileChipSize) fileChipSize.textContent = formatBytes(file.size);
});

function createDownloadButton(blob, filename, label) {
  const btn = document.createElement("a");

  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
  }
  currentDownloadUrl = URL.createObjectURL(blob);

  btn.href = currentDownloadUrl;
  btn.download = filename;
  btn.className = "cta-btn cta-mint";

  const icon = document.createElement("img");
  icon.src = "/assets/icons/download--v2.png";
  icon.alt = "download";
  icon.width = 16;
  icon.height = 16;
  icon.style.verticalAlign = "middle";
  icon.style.marginRight = "4px";

  btn.appendChild(icon);
  btn.appendChild(document.createTextNode(` Download ${label}`));

  btn.addEventListener("click", () => {
    setTimeout(() => {
      if (currentDownloadUrl) {
        URL.revokeObjectURL(currentDownloadUrl);
        currentDownloadUrl = null;
      }
    }, 100);
  });

  return btn;
}

function updateProgress(text) {
  progressText.textContent = text;
}

if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    if (!currentDownloadUrl) return;
    const a = document.createElement("a");
    a.href = currentDownloadUrl;
    a.download = currentOutputFilename;
    a.click();
  });
}

compressBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  let selectedModeCard = document.querySelector(".compress-mode-card.selected");
  if (!selectedModeCard || (!selectedModeCard.dataset && !selectedModeCard.value)) {
    selectedModeCard = document.querySelector('input[name="compressionMode"]:checked');
  }
  const mode =
    (selectedModeCard && selectedModeCard.dataset && selectedModeCard.dataset.mode) ||
    (selectedModeCard && selectedModeCard.value) ||
    "recommended";

  previewArea.classList.remove("is-visible");
  progressContainer.classList.add("is-visible");

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();
    const originalSize = arrayBuffer.byteLength;
    let compressedPdfBytes;

    if (mode === "recommended") {
      const PDFLib = window.PDFLib;
      if (!PDFLib) {
        showToast("PDF library not ready yet.", "error");
        progressContainer.classList.remove("is-visible");
        previewArea.classList.add("is-visible");
        return;
      }

      updateProgress("Optimizing PDF structure...");
      // Let the browser UI update
      await new Promise((resolve) => setTimeout(resolve, 0));

      const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });

      // Strip common metadata fields if they exist
      pdfDoc.setTitle("");
      pdfDoc.setAuthor("");
      pdfDoc.setSubject("");
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer("");
      pdfDoc.setCreator("");

      compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
    } else {
      updateProgress("Parsing document...");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const pdfjsLib = window["pdfjs-dist/build/pdf"];
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfjsDoc = await loadingTask.promise;
      try {
        const totalPages = pdfjsDoc.numPages;

        const jsPdfDoc = new window.jspdf.jsPDF({
          orientation: "portrait",
          unit: "pt",
          format: "a4",
        });

        // Process pages with worker pool concurrency limit
        const concurrencyLimit = 5;
        const pageIndices = Array.from({ length: totalPages }, (_, i) => i + 1);
        let completedCount = 0;

        const results = await mapConcurrent(
          pageIndices,
          concurrencyLimit,
          async (j) => {
            const page = await pdfjsDoc.getPage(j);
            try {
              const viewport = page.getViewport({ scale: 1.5 }); // Lower scale for better compression, 1.5 is a good balance

              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              const renderContext = {
                canvasContext: context,
                viewport: viewport,
              };

              await page.render(renderContext).promise;

              // Compress canvas as jpeg
              const imgData = canvas.toDataURL("image/jpeg", 0.7);

              // Immediately release canvas
              canvas.width = 0;
              canvas.height = 0;

              completedCount++;
              updateProgress(
                `Compressing page ${completedCount} of ${totalPages}...`,
              );
              await new Promise((resolve) => setTimeout(resolve, 0));

              return {
                index: j,
                imgData,
                width: viewport.width,
                height: viewport.height,
              };
            } finally {
              if (page && typeof page.cleanup === "function") {
                page.cleanup();
              }
            }
          },
        );

        for (const res of results) {
          // Resize jsPDF page to match viewport dimensions
          if (res.index > 1) {
            jsPdfDoc.addPage(
              [res.width, res.height],
              res.width > res.height ? "l" : "p",
            );
          } else {
            jsPdfDoc.setPage(1);
            // Not easy to set format of first page after creation in jsPDF, we try to orient it
          }

          jsPdfDoc.internal.pageSize.setWidth(res.width);
          jsPdfDoc.internal.pageSize.setHeight(res.height);

          jsPdfDoc.addImage(res.imgData, "JPEG", 0, 0, res.width, res.height);
        }

        updateProgress("Finalizing...");
        await new Promise((resolve) => setTimeout(resolve, 0));

        const outBlob = jsPdfDoc.output("blob");
        compressedPdfBytes = await outBlob.arrayBuffer();
      } finally {
        if (pdfjsDoc && typeof pdfjsDoc.destroy === "function") {
          try {
            await pdfjsDoc.destroy();
          } catch (e) {
            // Ignore destruction errors
          }
        }
      }
    }

    const compressedSize = compressedPdfBytes.byteLength;
    const blob = new Blob([compressedPdfBytes], { type: "application/pdf" });

    // Calculate savings
    const diff = originalSize - compressedSize;
    let savingsPct = 0;
    if (diff > 0) {
      savingsPct = ((diff / originalSize) * 100).toFixed(1);
    }

    if (resultSavings) {
      if (compressedSize >= originalSize && mode === "recommended") {
        resultSavings.textContent = "File is already highly optimized!";
        resultSavings.style.color = "#333";
      } else if (compressedSize >= originalSize && mode === "maximum") {
        resultSavings.textContent = "Could not compress further.";
        resultSavings.style.color = "#333";
      } else {
        resultSavings.textContent = `✓ Saved ${savingsPct}%`;
        resultSavings.style.color = "#0e5c37";
      }
    }

    const pctUsed = Math.min(
      100,
      Math.max(0, (compressedSize / originalSize) * 100),
    );
    if (sizeBarUsed) sizeBarUsed.style.width = `${pctUsed}%`;
    if (sizeBarOrig) sizeBarOrig.textContent = `${formatBytes(originalSize)} original`;
    if (sizeBarCurr) sizeBarCurr.textContent = `${formatBytes(compressedSize)} now`;

    const safeName = selectedFile.name.replace(/[\\/]/g, "_");
    const baseName =
      safeName.substring(0, safeName.lastIndexOf(".")) || safeName;
    const outName = `${baseName}-compressed.pdf`;

    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
    }
    currentDownloadUrl = URL.createObjectURL(blob);
    currentOutputFilename = outName;

    if (downloadFilename) downloadFilename.textContent = outName;

    if (downloadsDiv) {
      downloadsDiv.innerHTML = "";
      downloadsDiv.appendChild(createDownloadButton(blob, outName, outName));
    }

    progressContainer.classList.remove("is-visible");
    resultsArea.classList.add("is-visible");
  } catch (error) {
    showToast("Failed to compress PDF.", "error");
    progressContainer.classList.remove("is-visible");
    previewArea.classList.add("is-visible");
  }
});

resetBtn.addEventListener("click", () => {
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }
  selectedFile = null;
  currentOutputFilename = "";
  document.getElementById("compress-file-input").value = "";
  resultsArea.classList.remove("is-visible");
  dropZone.style.display = "block";

  if (resultSavings) {
    resultSavings.textContent = "";
    resultSavings.style.color = "";
  }
  if (sizeBarUsed) sizeBarUsed.style.width = "0%";
  if (sizeBarOrig) sizeBarOrig.textContent = "";
  if (sizeBarCurr) sizeBarCurr.textContent = "";
  if (downloadFilename) downloadFilename.textContent = "";
  if (downloadsDiv) downloadsDiv.innerHTML = "";

  modeCards.forEach((c) => c.classList.remove("selected"));
  const defaultCard = document.querySelector(
    '.compress-mode-card[data-mode="recommended"]',
  );
  if (defaultCard) defaultCard.classList.add("selected");
});
