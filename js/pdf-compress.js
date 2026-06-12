import { initDropZone } from "./drag-drop.js";

let selectedFile = null;

const dropZone = document.getElementById("compress-drop-zone");
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

initDropZone(dropZone, (files) => {
  if (!files.length) return;
  const file = files[0];
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    alert("Please select a valid PDF file.");
    return;
  }
  selectedFile = file;
  dropZone.style.display = "none";
  previewArea.style.display = "flex";
  infoText.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
});

function createDownloadButton(blob, filename, label) {
  const btn = document.createElement("a");
  btn.href = URL.createObjectURL(blob);
  btn.download = filename;
  btn.className = "cta-btn cta-mint";
  btn.textContent = `↓ Download ${label}`;
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
  previewArea.style.display = "none";
  progressContainer.style.display = "flex";

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();
    const originalSize = arrayBuffer.byteLength;
    let compressedPdfBytes;

    if (mode === "recommended") {
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
      // Create a copy of the buffer because pdfjs might detach it
      const bufferCopy = arrayBuffer.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: bufferCopy });
      const pdfjsDoc = await loadingTask.promise;
      const totalPages = pdfjsDoc.numPages;

      const jsPdfDoc = new window.jspdf.jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      // Avoid blocking the main thread entirely
      for (let i = 1; i <= totalPages; i++) {
        updateProgress(`Compressing page ${i} of ${totalPages}...`);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const page = await pdfjsDoc.getPage(i);
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

        // Resize jsPDF page to match viewport dimensions
        if (i > 1) {
          jsPdfDoc.addPage(
            [viewport.width, viewport.height],
            viewport.width > viewport.height ? "l" : "p",
          );
        } else {
          jsPdfDoc.setPage(1);
          // Not easy to set format of first page after creation in jsPDF, we try to orient it
        }

        jsPdfDoc.internal.pageSize.setWidth(viewport.width);
        jsPdfDoc.internal.pageSize.setHeight(viewport.height);

        jsPdfDoc.addImage(
          imgData,
          "JPEG",
          0,
          0,
          viewport.width,
          viewport.height,
        );
      }

      updateProgress("Finalizing...");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const outBlob = jsPdfDoc.output("blob");
      compressedPdfBytes = await outBlob.arrayBuffer();
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

    progressContainer.style.display = "none";
    resultsArea.style.display = "block";
  } catch (error) {
    console.error(error);
    alert(
      "An error occurred while compressing the PDF. See console for details.",
    );
    progressContainer.style.display = "none";
    previewArea.style.display = "flex";
  }
});

resetBtn.addEventListener("click", () => {
  selectedFile = null;
  document.getElementById("compress-file-input").value = "";
  resultsArea.style.display = "none";
  dropZone.style.display = "block";
  downloadsDiv.innerHTML = "";
  statsSavings.textContent = "";
  statsDetails.textContent = "";
});
