import { initDropZone, showToast, setProgress } from "./drag-drop.js";

const dropZone = document.getElementById("pdf-drop-zone");
const fileInput = document.getElementById("pdf-file-input");
const progressArea = document.getElementById("pdf-progress");
const progressBar = document.getElementById("pdf-progress-bar");
const progressLabel = document.getElementById("pdf-progress-label");
const resultsArea = document.getElementById("pdf-results");
const textOutput = document.getElementById("pdf-text-output");
const ocrNotice = document.getElementById("ocr-notice");
const copyBtn = document.getElementById("pdf-copy-btn");
const downloadBtn = document.getElementById("pdf-download-btn");
const resetBtn = document.getElementById("pdf-reset-btn");

let currentFile = null;
let currentText = "";

initDropZone(dropZone, fileInput, (files) => {
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

resetBtn.addEventListener("click", () => {
  currentFile = null;
  currentText = "";
  textOutput.value = "";
  ocrNotice.style.display = "none";
  resultsArea.style.display = "none";
  progressArea.style.display = "none";
  dropZone.style.display = "block";
  fileInput.value = "";
});

copyBtn.addEventListener("click", () => {
  if (currentText) {
    navigator.clipboard
      .writeText(currentText)
      .then(() => {
        showToast("Text copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy text", err);
        showToast("Failed to copy text", "error");
      });
  }
});

downloadBtn.addEventListener("click", () => {
  if (currentText && currentFile) {
    const blob = new Blob([currentText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      currentFile.name.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_") + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});

async function handleFile(file) {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showToast("Please upload a PDF file", "error");
    return;
  }
  currentFile = file;
  currentText = "";
  textOutput.value = "";
  dropZone.style.display = "none";
  progressArea.style.display = "block";
  resultsArea.style.display = "flex";
  resultsArea.style.flexDirection = "column";
  ocrNotice.style.display = "none";
  setProgress(progressBar, progressLabel, 0, "Analyzing PDF...");

  let ocrWorkerPromise = null;

  try {
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    const arrayBuffer = await file.arrayBuffer();
    // Copy the buffer so it's not detached if needed later
    const bufferCopy = arrayBuffer.slice(0);
    const pdfDoc = await pdfjsLib.getDocument(bufferCopy).promise;
    const numPages = pdfDoc.numPages;

    let ocrTriggered = false;
    let completedPages = 0;

    // Use a promise singleton so we don't accidentally initialize the worker multiple times in parallel
    const getOcrWorker = () => {
      if (!ocrWorkerPromise) {
        ocrWorkerPromise = window.Tesseract.createWorker("hin+eng");
      }
      return ocrWorkerPromise;
    };

    const batchSize = 25;
    const pageTexts = new Array(numPages);

    for (let start = 1; start <= numPages; start += batchSize) {
      const batch = [];
      const end = Math.min(start + batchSize - 1, numPages);

      for (let i = start; i <= end; i++) {
        batch.push(
          (async () => {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const { text: finalPageText, usedOcr } = await extractTextFromPage(
              page,
              textContent,
              getOcrWorker,
            );

            if (usedOcr) {
              ocrTriggered = true;
              ocrNotice.style.display = "block";
            }

            pageTexts[i - 1] = finalPageText;
            completedPages++;

            setProgress(
              progressBar,
              progressLabel,
              (completedPages / numPages) * 100,
              `Extracting text... (${completedPages} of ${numPages} pages)`,
            );
          })(),
        );
      }

      await Promise.all(batch);

      // Update text output progressively
      currentText = pageTexts.filter((t) => t !== undefined).join("\n\n");
      textOutput.value = currentText.trim();
    }

    if (ocrWorkerPromise) {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
    }

    setProgress(progressBar, progressLabel, 100, "Extraction complete!");
    setTimeout(() => {
      progressArea.style.display = "none";
    }, 500);
  } catch (error) {
    console.error("Error processing PDF:", error);
    showToast("Failed to process PDF", "error");
    if (ocrWorkerPromise) {
      try {
        const worker = await ocrWorkerPromise;
        await worker.terminate();
      } catch (e) {
        // Ignore termination errors on failure
      }
    }
    progressArea.style.display = "none";
    resultsArea.style.display = "none";
    dropZone.style.display = "block";
  }
}

async function extractTextFromPage(page, textContent, getOcrWorker) {
  const pageText = textContent.items.map((item) => item.str).join(" ");

  const cleaned = pageText.replace(/\s/g, "");
  const devanagariCount = (pageText.match(/[\u0900-\u097F]/g) || []).length;
  const devanagariRatio =
    cleaned.length > 0 ? devanagariCount / cleaned.length : 0;
  const englishWordCount = (
    pageText.toLowerCase().match(/\b[a-z]{3,}\b/g) || []
  ).length;

  let needsOCR = false;

  // Condition 1: Scanned / Empty
  if (cleaned.length < 5) {
    needsOCR = true;
  }
  // Condition 2: Garbled / Legacy-Encoded
  else if (
    cleaned.length >= 20 &&
    devanagariRatio < 0.1 &&
    englishWordCount < 3
  ) {
    needsOCR = true;
  }

  let finalPageText = "";

  if (needsOCR) {
    const worker = await getOcrWorker();

    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    const imageData = canvas.toDataURL("image/png");

    const {
      data: { text },
    } = await worker.recognize(imageData);
    finalPageText = text;

    // Free canvas memory immediately
    canvas.width = 0;
    canvas.height = 0;
  } else {
    finalPageText = pageText;
  }

  return { text: finalPageText, usedOcr: needsOCR };
}
