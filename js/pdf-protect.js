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
  const { PDFDocument } = window.PDFLib;
  if (!PDFDocument) throw new Error("pdf-lib is not ready");

  const buffer = await file.arrayBuffer();

  // Load the document (if it's already encrypted, we assume they have the right to encrypt it further,
  // though typically they'd just be re-encrypting. Ignore encryption to read the original if possible.)
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  const pdfBytes = await pdfDoc.save({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
    },
  });

  return new Blob([pdfBytes], { type: "application/pdf" });
}

protectBtn.addEventListener("click", async () => {
  if (!pdfFile) return showToast("Please select a PDF first.", "error");

  const password = validatePasswords();
  if (!password) return;

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
