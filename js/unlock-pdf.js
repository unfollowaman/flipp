import { initDropZone, showToast } from "./drag-drop.js";

const { PDFDocument } = window.PDFLib;

let currentFileBytes = null;
let currentFileName = "";

const dropZoneEl = document.getElementById("unlock-drop-zone");
const previewAreaEl = document.getElementById("unlock-preview-area");
const infoEl = document.getElementById("unlock-info");
const passwordGroupEl = document.getElementById("unlock-password-group");
const passwordInput = document.getElementById("unlock-password");
const errorMsgEl = document.getElementById("unlock-error");
const unlockBtn = document.getElementById("unlock-btn");

const resultsAreaEl = document.getElementById("unlock-results");
const downloadBtn = document.getElementById("unlock-download-btn");
const resetBtn = document.getElementById("unlock-reset-btn");

let pdfDocToSave = null;
let needsPassword = false;

initDropZone("unlock-drop-zone", "unlock-file-input", async (files) => {
  const file = files[0];
  if (!file) return;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Please select a PDF file.");
    return;
  }

  currentFileName = file.name;

  try {
    currentFileBytes = await file.arrayBuffer();

    // First, attempt to load the document without a password
    try {
        pdfDocToSave = await PDFDocument.load(currentFileBytes);
        needsPassword = false;

        dropZoneEl.style.display = "none";
        previewAreaEl.style.display = "block";
        infoEl.textContent = `Ready to unlock: ${currentFileName}`;
        passwordGroupEl.style.display = "none";
        errorMsgEl.style.display = "none";

    } catch (e) {
        const errorMsg = String(e).toLowerCase();
        if (errorMsg.includes("password") || errorMsg.includes("encrypted")) {
            // Document requires a user password
            needsPassword = true;
            pdfDocToSave = null;

            dropZoneEl.style.display = "none";
            previewAreaEl.style.display = "block";
            infoEl.textContent = `Ready to unlock: ${currentFileName}`;
            passwordGroupEl.style.display = "block";
            errorMsgEl.style.display = "none";
            passwordInput.value = "";
            passwordInput.focus();
        } else {
            // Some other loading error (e.g., corrupt PDF)
            throw e;
        }
    }
  } catch (err) {
    console.error("Error loading PDF:", err);
    showToast("Failed to read PDF. It might be corrupted.");
  }
});

unlockBtn.addEventListener("click", async () => {
    if (!currentFileBytes) return;

    unlockBtn.disabled = true;
    unlockBtn.textContent = "Unlocking...";
    errorMsgEl.style.display = "none";

    try {
        if (needsPassword) {
            const password = passwordInput.value;
            try {
                pdfDocToSave = await PDFDocument.load(currentFileBytes, { password });
            } catch (e) {
                const errorMsg = String(e).toLowerCase();
                if (errorMsg.includes("password") || errorMsg.includes("encrypted")) {
                    // Incorrect password
                    errorMsgEl.style.display = "block";
                    unlockBtn.disabled = false;
                    unlockBtn.textContent = "Unlock PDF →";
                    return;
                } else {
                    throw e;
                }
            }
        }

        // At this point, we have a successfully loaded pdfDocToSave
        const unlockedBytes = await pdfDocToSave.save();

        const blob = new Blob([unlockedBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        // Sanitize original filename and append prefix
        const safeName = currentFileName.replace(/[\\/]/g, "_");
        const outName = `unlocked_${safeName}`;

        downloadBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = url;
            a.download = outName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        previewAreaEl.style.display = "none";
        resultsAreaEl.style.display = "block";

    } catch (err) {
        console.error("Error unlocking PDF:", err);
        showToast("An error occurred while unlocking the PDF.");
        unlockBtn.disabled = false;
        unlockBtn.textContent = "Unlock PDF →";
    }
});

resetBtn.addEventListener("click", () => {
  currentFileBytes = null;
  currentFileName = "";
  pdfDocToSave = null;
  needsPassword = false;

  passwordInput.value = "";
  errorMsgEl.style.display = "none";

  resultsAreaEl.style.display = "none";
  previewAreaEl.style.display = "none";
  dropZoneEl.style.display = "block";

  unlockBtn.disabled = false;
  unlockBtn.textContent = "Unlock PDF →";
});
