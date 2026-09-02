import { initDropZone, showToast } from "./drag-drop.js";

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

function addFiles(files) {
  const first = files.find(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (!first) return showToast("Please add a PDF file.", "error");

  pdfFile = first;
  protectedBlob = null;
  previewArea.classList.add("is-visible");
  resultsArea.classList.remove("is-visible");
  passwordEl.value = "";
  confirmPasswordEl.value = "";
  infoEl.textContent = `Selected: ${first.name}`;
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
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
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

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfjsDoc.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const widthPt = unscaledViewport.width;
    const heightPt = unscaledViewport.height;

    const renderViewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;

    await page.render({ canvasContext: context, viewport: renderViewport }).promise;

    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    canvas.width = 0;
    canvas.height = 0;

    if (i > 1) {
      jsPdfDoc.addPage([widthPt, heightPt], widthPt > heightPt ? "l" : "p");
    } else {
      jsPdfDoc.internal.pageSize.setWidth(widthPt);
      jsPdfDoc.internal.pageSize.setHeight(heightPt);
    }

    jsPdfDoc.addImage(imgData, "JPEG", 0, 0, widthPt, heightPt);
  }

  return jsPdfDoc.output("blob");
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
    previewArea.classList.remove("is-visible");
    resultsArea.classList.add("is-visible");
    showToast("Protected PDF is ready!");
  } catch (err) {
    console.error(err);
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
  previewArea.classList.remove("is-visible");
  resultsArea.classList.remove("is-visible");
  infoEl.textContent = "";
  passwordEl.value = "";
  confirmPasswordEl.value = "";
});

if (dropZoneEl && fileInputEl) {
  initDropZone(dropZoneEl, fileInputEl, addFiles);
}
