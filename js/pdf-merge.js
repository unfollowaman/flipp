import { initDropZone, showToast } from "./drag-drop.js";

let pdfFiles = [];
let mergedBlob = null;

const dropZoneEl = document.getElementById("merge-drop-zone");
const fileInputEl = document.getElementById("merge-file-input");
const previewArea = document.getElementById("merge-preview-area");
const listEl = document.getElementById("merge-file-list");
const countEl = document.getElementById("merge-file-count");
const mergeBtn = document.getElementById("merge-btn");
const resultsArea = document.getElementById("merge-results");
const downloadBtn = document.getElementById("merge-download-btn");
const resetBtn = document.getElementById("merge-reset-btn");

function addFiles(files) {
  const valid = files.filter(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!valid.length) return showToast("Please add PDF files only.", "error");
  pdfFiles = [...pdfFiles, ...valid];
  renderPreview();
}

function renderPreview() {
  previewArea.classList.add("is-visible");
  resultsArea.classList.remove("is-visible");
  listEl.innerHTML = "";
  countEl.textContent = `${pdfFiles.length} PDF${pdfFiles.length !== 1 ? "s" : ""} selected`;
  pdfFiles.forEach((file, idx) => {
    const li = document.createElement("li");
    li.textContent = `${idx + 1}. ${file.name}`;
    listEl.appendChild(li);
  });
}

mergeBtn.addEventListener("click", async () => {
  if (pdfFiles.length < 2)
    return showToast("Add at least 2 PDFs to merge.", "error");
  const PDFLib = window.PDFLib;
  if (!PDFLib) return showToast("PDF library not ready yet.", "error");

  mergeBtn.disabled = true;
  mergeBtn.textContent = "Merging...";

  // Yield the main thread to allow the browser to paint the button state changes
  await new Promise((r) => setTimeout(r, 50));

  try {
    const outPdf = await PDFLib.PDFDocument.create();

    for (const file of pdfFiles) {
      const srcBytes = await file.arrayBuffer();
      const srcPdf = await PDFLib.PDFDocument.load(srcBytes, {
        ignoreEncryption: true,
      });
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
    showToast("Failed to merge PDFs. Ensure files are valid and not password protected.", "error");
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

resetBtn.addEventListener("click", () => {
  pdfFiles = [];
  mergedBlob = null;
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  listEl.innerHTML = "";
  countEl.textContent = "";
});

initDropZone(dropZoneEl, fileInputEl, addFiles);
