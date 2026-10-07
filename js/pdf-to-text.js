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
const boxCopyBtn = document.getElementById("pdf-box-copy-btn");
const downloadBtn = document.getElementById("pdf-download-btn");
const resetBtn = document.getElementById("pdf-reset-btn");

let currentFile = null;
let currentText = "";

const COPY_SVG = `<svg class="copy-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_SVG = `<svg class="copy-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

export const DEFAULT_QUALITY_THRESHOLDS = {
  SHORT_TOKEN_RATIO_MAX: 0.35,
  MIN_DEVANAGARI_TOKENS_FOR_FRAGMENTATION: 5,
  MAX_NULL_CHARS: 0,
  MAX_REPLACEMENT_CHARS: 0,
  MAX_ISOLATED_MATRAS: 1,
};

/**
 * Evaluates the extraction quality of native text extracted from a PDF page.
 * Detects NUL bytes (\u0000), replacement characters (\uFFFD), isolated Devanagari matras,
 * and high short Devanagari token fragmentation.
 *
 * @param {string} pageText - Native text string joined from text items.
 * @param {Object} [textContent] - Raw PDF.js textContent object (optional).
 * @param {Object} [options] - Custom quality thresholds.
 * @returns {Object} Quality evaluation result with isValid, reasons, and metrics.
 */
export function evaluateExtractionQuality(pageText, textContent = null, options = {}) {
  const thresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...options };
  const text = pageText || "";
  const cleanedLength = text.replace(/\s/g, "").length;

  const metrics = {
    cleanedLength,
    nullCount: 0,
    replacementCount: 0,
    isolatedMatraCount: 0,
    shortTokenRatio: 0,
    totalDevanagariTokens: 0,
    shortDevanagariTokens: 0,
  };

  const reasons = [];

  if (cleanedLength < 5) {
    reasons.push("scanned-or-empty");
    return { isValid: false, reasons, metrics };
  }

  const nullMatches = text.match(/\u0000/g);
  metrics.nullCount = nullMatches ? nullMatches.length : 0;
  if (metrics.nullCount > thresholds.MAX_NULL_CHARS) {
    reasons.push("null-characters");
  }

  const replacementMatches = text.match(/\uFFFD/g);
  metrics.replacementCount = replacementMatches ? replacementMatches.length : 0;
  if (metrics.replacementCount > thresholds.MAX_REPLACEMENT_CHARS) {
    reasons.push("replacement-characters");
  }

  const isolatedMatraRegex = /(?:^|\s)[\u093e-\u094c\u0901-\u0903]/g;
  const isolatedMatraMatches = text.match(isolatedMatraRegex);
  metrics.isolatedMatraCount = isolatedMatraMatches ? isolatedMatraMatches.length : 0;
  if (metrics.isolatedMatraCount > thresholds.MAX_ISOLATED_MATRAS) {
    reasons.push("isolated-devanagari-matras");
  }

  const tokens = text.split(/\s+/);
  const devanagariTokenRegex = /[\u0900-\u097F]/;
  const devanagariTokens = tokens.filter((t) => devanagariTokenRegex.test(t));
  metrics.totalDevanagariTokens = devanagariTokens.length;

  if (devanagariTokens.length >= thresholds.MIN_DEVANAGARI_TOKENS_FOR_FRAGMENTATION) {
    const shortTokens = devanagariTokens.filter(
      (t) => t.replace(/[^\u0900-\u097F]/g, "").length <= 2
    );
    metrics.shortDevanagariTokens = shortTokens.length;
    metrics.shortTokenRatio = shortTokens.length / devanagariTokens.length;

    if (metrics.shortTokenRatio > thresholds.SHORT_TOKEN_RATIO_MAX) {
      reasons.push("high-devanagari-token-fragmentation");
    }
  }

  const isValid = reasons.length === 0;
  return { isValid, reasons, metrics };
}

if (dropZone && fileInput) {
  initDropZone(dropZone, fileInput, (files) => {
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    currentFile = null;
    currentText = "";
    if (textOutput) textOutput.value = "";
    if (ocrNotice) ocrNotice.style.display = "none";
    if (resultsArea) resultsArea.classList.remove("is-visible");
    if (progressArea) progressArea.style.display = "none";
    if (dropZone) dropZone.style.display = "block";
    if (fileInput) fileInput.value = "";
    if (boxCopyBtn) {
      boxCopyBtn.classList.remove("copied");
      boxCopyBtn.innerHTML = COPY_SVG;
    }
  });
}

function copyText(isBoxButton = false) {
  const textToCopy = currentText || (textOutput ? textOutput.value : "");
  if (textToCopy) {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        showToast("Text copied to clipboard!");
        if (isBoxButton && boxCopyBtn) {
          boxCopyBtn.classList.add("copied");
          boxCopyBtn.innerHTML = CHECK_SVG;
          setTimeout(() => {
            boxCopyBtn.classList.remove("copied");
            boxCopyBtn.innerHTML = COPY_SVG;
          }, 1500);
        }
      })
      .catch((err) => {
        console.error("Failed to copy text", err);
        showToast("Failed to copy text", "error");
      });
  }
}

if (copyBtn) {
  copyBtn.addEventListener("click", () => copyText(false));
}

if (boxCopyBtn) {
  boxCopyBtn.addEventListener("click", () => copyText(true));
}

if (downloadBtn) {
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
}

function showProcessingUI() {
  if (dropZone) dropZone.style.display = "none";
  if (progressArea) progressArea.style.display = "block";
  if (resultsArea) {
    resultsArea.classList.add("is-visible");
    resultsArea.style.flexDirection = "column";
  }
  if (ocrNotice) ocrNotice.style.display = "none";
  setProgress(progressBar, progressLabel, 0, "Analyzing PDF...");
}

function resetProcessingUI() {
  if (progressArea) progressArea.style.display = "none";
  if (resultsArea) resultsArea.classList.remove("is-visible");
  if (dropZone) dropZone.style.display = "block";
}

async function terminateOcrWorker(ocrWorkerPromise) {
  if (ocrWorkerPromise) {
    try {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
    } catch (e) {
      // Ignore termination errors on failure
    }
  }
}

async function processSinglePage(pdfDoc, i, getOcrWorker, pageTexts, tracker) {
  const page = await pdfDoc.getPage(i);
  try {
    const textContent = await page.getTextContent();
    const { text: finalPageText, usedOcr } = await extractTextFromPage(
      page,
      textContent,
      getOcrWorker
    );

    if (usedOcr && ocrNotice) {
      ocrNotice.style.display = "block";
    }

    pageTexts[i - 1] = finalPageText;
    tracker.completedPages++;

    setProgress(
      progressBar,
      progressLabel,
      (tracker.completedPages / tracker.numPages) * 100,
      `Extracting text... (${tracker.completedPages} of ${tracker.numPages} pages)`
    );
  } finally {
    if (page && typeof page.cleanup === "function") {
      page.cleanup();
    }
  }
}

async function extractAllPagesText(pdfDoc, getOcrWorker) {
  const numPages = pdfDoc.numPages;
  const tracker = { completedPages: 0, numPages };
  const batchSize = 25;
  const pageTexts = new Array(numPages);

  for (let start = 1; start <= numPages; start += batchSize) {
    const batch = [];
    const end = Math.min(start + batchSize - 1, numPages);

    for (let i = start; i <= end; i++) {
      batch.push(
        processSinglePage(pdfDoc, i, getOcrWorker, pageTexts, tracker)
      );
    }

    await Promise.all(batch);

    // Update text output progressively
    currentText = pageTexts.filter((t) => t !== undefined).join("\n\n");
    if (textOutput) textOutput.value = currentText.trim();
  }
}

async function handleFile(file) {
  if (
    !file ||
    (file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf"))
  ) {
    showToast("Please upload a PDF file", "error");
    return;
  }

  currentFile = file;
  currentText = "";
  if (textOutput) textOutput.value = "";
  showProcessingUI();

  let ocrWorkerPromise = null;
  let pdfDoc = null;

  // Use a promise singleton so we don't accidentally initialize the worker multiple times in parallel
  const getOcrWorker = () => {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = window.Tesseract.createWorker("hin+eng");
    }
    return ocrWorkerPromise;
  };

  try {
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;

    await extractAllPagesText(pdfDoc, getOcrWorker);

    await terminateOcrWorker(ocrWorkerPromise);

    setProgress(progressBar, progressLabel, 100, "Extraction complete!");
    setTimeout(() => {
      if (progressArea) progressArea.style.display = "none";
    }, 500);
  } catch (error) {
    console.error("Error processing PDF:", error);
    showToast("Failed to process PDF", "error");
    await terminateOcrWorker(ocrWorkerPromise);
    resetProcessingUI();
  } finally {
    if (pdfDoc && typeof pdfDoc.destroy === "function") {
      try {
        await pdfDoc.destroy();
      } catch (e) {
        // Ignore destruction errors
      }
    }
  }
}

export async function extractTextFromPage(page, textContent, getOcrWorker) {
  const pageText = textContent.items.map((item) => item.str).join(" ");

  const quality = evaluateExtractionQuality(pageText, textContent);
  const needsOCR = !quality.isValid;

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

    const {
      data: { text },
    } = await worker.recognize(canvas);
    finalPageText = text;

    // Free canvas memory immediately
    canvas.width = 0;
    canvas.height = 0;
  } else {
    finalPageText = pageText;
  }

  return { text: finalPageText, usedOcr: needsOCR, quality };
}
