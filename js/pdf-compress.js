import { initDropZone, showToast } from "./drag-drop.js";

let selectedFile = null;
let currentDownloadUrl = null;

const dropZone = document.getElementById("compress-drop-zone");
const fileInput = document.getElementById("compress-file-input");
const previewArea = document.getElementById("compress-preview-area");
const resultsArea = document.getElementById("compress-results");
const compressBtn = document.getElementById("compress-btn");
const resetBtn = document.getElementById("compress-reset-btn");
const infoText = document.getElementById("compress-info");
const downloadsDiv = document.getElementById("compress-downloads");

const progressContainer = document.getElementById(
  "compress-progress-container",
);
const progressText = document.getElementById("compress-progress-text");
const modeDesc = document.getElementById("compression-mode-desc");
const radios = document.getElementsByName("compressionMode");

const statsSavings = document.getElementById("compress-stats-savings");
const statsDetails = document.getElementById("compress-stats-details");

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

radios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (e.target.value === "recommended") {
      modeDesc.textContent =
        "Optimizes PDF structure and strips unused metadata. Perfect quality.";
    } else {
      modeDesc.textContent =
        "Warning: Rasterizes pages to compressed images. Drastically reduces size but makes text unselectable and may slightly lower clarity.";
    }
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
  infoText.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
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

compressBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  const mode = document.querySelector(
    'input[name="compressionMode"]:checked',
  ).value;
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

    if (compressedSize >= originalSize && mode === "recommended") {
      statsSavings.textContent = "File is already highly optimized!";
      statsSavings.style.color = "#333";
      statsDetails.textContent = `Original: ${formatBytes(originalSize)} | Output: ${formatBytes(compressedSize)}`;
    } else if (compressedSize >= originalSize && mode === "maximum") {
      statsSavings.textContent = "Could not compress further.";
      statsSavings.style.color = "#333";
      statsDetails.textContent = `Original: ${formatBytes(originalSize)} | Output: ${formatBytes(compressedSize)}`;
    } else {
      statsSavings.textContent = `Saved ${savingsPct}%`;
      statsSavings.style.color = "green";
      statsDetails.textContent = `Original: ${formatBytes(originalSize)} → Compressed: ${formatBytes(compressedSize)}`;
    }

    downloadsDiv.innerHTML = "";

    const safeName = selectedFile.name.replace(/[\\/]/g, "_");
    const baseName =
      safeName.substring(0, safeName.lastIndexOf(".")) || safeName;
    const outName = `${baseName}-compressed.pdf`;

    downloadsDiv.appendChild(createDownloadButton(blob, outName, outName));

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
  document.getElementById("compress-file-input").value = "";
  resultsArea.classList.remove("is-visible");
  dropZone.style.display = "block";
  downloadsDiv.innerHTML = "";
  statsSavings.textContent = "";
  statsDetails.textContent = "";
});
