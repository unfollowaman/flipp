import { initDropZone, showToast, renderPdfFirstPage } from "./drag-drop.js";

let pdfFile = null;
let protectedBlob = null;

const dropZoneEl = document.getElementById("protect-drop-zone");
const fileInputEl = document.getElementById("protect-file-input");
const previewArea = document.getElementById("protect-preview-area");
const infoEl = document.getElementById("protect-info");
const protectBtn = document.getElementById("protect-btn");
const resultsArea = document.getElementById("protect-results");
const downloadBtn = document.getElementById("protect-download-btn");
const resetBtn = document.getElementById("protect-reset-btn");
const passwordEl = document.getElementById("protect-password");
const confirmPasswordEl = document.getElementById("protect-password-confirm");
const togglePwBtn = document.getElementById("protect-toggle-pw");
const togglePwConfirmBtn = document.getElementById("protect-toggle-pw-confirm");

const masterTitleEl = document.getElementById("protect-master-title");
const imgClearEl = document.getElementById("protect-img-clear");
const imgResultLockedEl = document.getElementById("protect-result-img-locked");

function setupPasswordToggle(toggleBtn, inputEl) {
  if (!toggleBtn || !inputEl) return;
  toggleBtn.addEventListener("click", () => {
    const show = inputEl.type === "password";
    inputEl.type = show ? "text" : "password";
    toggleBtn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggleBtn.title = show ? "Hide password" : "Show password";
    toggleBtn.textContent = show ? "🙈" : "🐵";
  });
}

setupPasswordToggle(togglePwBtn, passwordEl);
setupPasswordToggle(togglePwConfirmBtn, confirmPasswordEl);

async function addFiles(files) {
  const first = files.find(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!first) return showToast("Please add a PDF file.", "error");

  pdfFile = first;
  protectedBlob = null;
  if (dropZoneEl) dropZoneEl.style.display = "";
  previewArea.classList.add("is-visible");
  resultsArea.classList.remove("is-visible");
  passwordEl.value = "";
  confirmPasswordEl.value = "";
  if (infoEl) infoEl.textContent = `Selected: ${first.name}`;

  if (imgClearEl) imgClearEl.src = "";
  if (imgResultLockedEl) imgResultLockedEl.src = "";

  try {
    const dataUrl = await renderPdfFirstPage(first);
    if (dataUrl) {
      if (imgClearEl) imgClearEl.src = dataUrl;
      if (imgResultLockedEl) imgResultLockedEl.src = dataUrl;
    }
  } catch (err) {
    // Non-critical render fallback
  }
}

function validatePasswords() {
  const password = passwordEl.value.trim();
  const confirm = confirmPasswordEl.value.trim();

  if (password.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return null;
  }
  if (password !== confirm) {
    showToast("Passwords do not match.", "error");
    return null;
  }
  return password;
}

async function encryptPdf(file, password) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  const { jsPDF } = window.jspdf || {};

  if (!pdfjsLib || !jsPDF) {
    throw new Error("PDF processing libraries are not ready.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfjsDoc = await loadingTask.promise;
  const numPages = pdfjsDoc.numPages;

  const jsPdfDoc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    encryption: {
      userPassword: password,
      ownerPassword: password,
      userPermissions: ["print", "modify", "copy", "annot-forms"],
    },
  });

  const BATCH_SIZE = 4;
  const canvasPool = [];
  try {
    for (let start = 1; start <= numPages; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, numPages);
      const pagePromises = [];

      for (let pageNum = start; pageNum <= end; pageNum++) {
        const slot = pageNum - start;
        pagePromises.push(
          (async () => {
            let page = null;
            try {
              page = await pdfjsDoc.getPage(pageNum);
              const unscaledViewport = page.getViewport({ scale: 1.0 });
              const widthPt = unscaledViewport.width;
              const heightPt = unscaledViewport.height;

              const renderViewport = page.getViewport({ scale: 2.0 });

              if (!canvasPool[slot]) {
                const canvas = document.createElement("canvas");
                canvasPool[slot] = {
                  canvas,
                  context: canvas.getContext("2d"),
                };
              }
              const { canvas, context } = canvasPool[slot];
              canvas.width = renderViewport.width;
              canvas.height = renderViewport.height;
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);

              await page.render({ canvasContext: context, viewport: renderViewport }).promise;

              const imgData = canvas.toDataURL("image/jpeg", 0.95);

              return { pageNum, widthPt, heightPt, imgData };
            } finally {
              if (page && typeof page.cleanup === "function") {
                page.cleanup();
              }
            }
          })()
        );
      }

      const pages = await Promise.all(pagePromises);

      for (const pageData of pages) {
        const { pageNum, widthPt, heightPt, imgData } = pageData;
        if (pageNum > 1) {
          jsPdfDoc.addPage([widthPt, heightPt], widthPt > heightPt ? "l" : "p");
        } else {
          jsPdfDoc.internal.pageSize.setWidth(widthPt);
          jsPdfDoc.internal.pageSize.setHeight(heightPt);
        }

        jsPdfDoc.addImage(imgData, "JPEG", 0, 0, widthPt, heightPt);
      }
    }

    return jsPdfDoc.output("blob");
  } finally {
    for (const poolItem of canvasPool) {
      if (poolItem && poolItem.canvas) {
        poolItem.canvas.width = 0;
        poolItem.canvas.height = 0;
      }
    }
    if (pdfjsDoc && typeof pdfjsDoc.destroy === "function") {
      try {
        await pdfjsDoc.destroy();
      } catch (e) {
        // Ignore destruction errors
      }
    }
  }
}

protectBtn.addEventListener("click", async () => {
  if (!pdfFile) return showToast("Please select a PDF first.", "error");

  const password = validatePasswords();
  if (!password) return;

  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  const { jsPDF } = window.jspdf || {};
  if (!pdfjsLib || !jsPDF) {
    return showToast("PDF library is still loading. Please try again in a moment.", "error");
  }

  protectBtn.disabled = true;
  protectBtn.textContent = "Protecting…";

  try {
    protectedBlob = await encryptPdf(pdfFile, password);
    if (dropZoneEl) dropZoneEl.style.display = "none";
    previewArea.classList.remove("is-visible");

    const baseName = pdfFile.name.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_");
    const downloadFilename = `${baseName}-protected.pdf`;

    if (masterTitleEl) masterTitleEl.textContent = pdfFile.name;
    if (downloadBtn) downloadBtn.textContent = `Download ${downloadFilename}`;

    resultsArea.classList.add("is-visible");
    showToast("Protected PDF is ready!");
  } catch (err) {
    showToast("Failed to protect PDF. Try another file.", "error");
  } finally {
    protectBtn.disabled = false;
    protectBtn.textContent = "Protect PDF →";
  }
});

downloadBtn.addEventListener("click", () => {
  if (!protectedBlob || !pdfFile) return;
  const baseName = pdfFile.name.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(protectedBlob);
  a.download = `${baseName}-protected.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
});

resetBtn.addEventListener("click", () => {
  pdfFile = null;
  protectedBlob = null;
  if (dropZoneEl) dropZoneEl.style.display = "";
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  if (infoEl) infoEl.textContent = "";
  passwordEl.value = "";
  confirmPasswordEl.value = "";
  if (downloadBtn) downloadBtn.textContent = "Download Protected PDF";
  if (masterTitleEl) masterTitleEl.textContent = "";
  if (imgClearEl) imgClearEl.src = "";
  if (imgResultLockedEl) imgResultLockedEl.src = "";
});

if (dropZoneEl && fileInputEl) {
  initDropZone(dropZoneEl, fileInputEl, addFiles);
}
