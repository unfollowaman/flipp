import { initDropZone, showToast, setProgress, activatePill, fileToDataUrl, triggerDownload } from "./drag-drop.js";

let currentDownloadUrl = null;

let pdfBytesOriginal = null;
let numPages = 0;
let currentPage = 1;
let pdfjsDocument = null;

let currentMode = "draw";
let currentInkColor = "#000000";
let signaturePad = null;
let uploadedImageSrc = null;

const dropZone = document.getElementById("sign-drop-zone");
const fileInput = document.getElementById("sign-file-input");
const optionsBar = document.getElementById("sign-options");
const previewArea = document.getElementById("sign-preview-area");
const fileInfo = document.getElementById("sign-file-info");
const pageInfo = document.getElementById("sign-page-info");
const previewCanvas = document.getElementById("sign-preview-canvas");
const canvasContainer = document.getElementById("sign-canvas-container");
const loadingOverlay = document.getElementById("sign-loading-overlay");
const prevPageBtn = document.getElementById("sign-prev-page");
const nextPageBtn = document.getElementById("sign-next-page");

const modePills = document.querySelectorAll("#sign-mode-pills .opt-pill");
const colorPills = document.querySelectorAll("#sign-color-pills .opt-pill");
const drawControls = document.getElementById("sign-draw-controls");
const uploadControls = document.getElementById("sign-upload-controls");
const typeControls = document.getElementById("sign-type-controls");

const padCanvas = document.getElementById("sign-pad-canvas");
const clearBtn = document.getElementById("sign-clear-btn");

const imgDrop = document.getElementById("sign-img-drop");
const imgUpload = document.getElementById("sign-image-upload");
const imgPreview = document.getElementById("sign-image-preview");

const typeInput = document.getElementById("sign-type-input");
const fontSizeInput = document.getElementById("sign-font-size");
const fontSizeVal = document.getElementById("sign-font-size-val");
const typePreview = document.getElementById("sign-type-preview");
const typeCanvas = document.getElementById("sign-type-canvas");

const placeBtn = document.getElementById("sign-place-btn");
const downloadBtn = document.getElementById("sign-download-btn");
const downloadFinalBtn = document.getElementById("sign-download-final-btn");
const resetBtn = document.getElementById("sign-reset-btn");

const progressArea = document.getElementById("sign-progress");
const progressBar = document.getElementById("sign-progress-bar");
const progressLabel = document.getElementById("sign-progress-label");
const resultsArea = document.getElementById("sign-results");

const pdfjsLib = window["pdfjs-dist/build/pdf"];

// Init Signature Pad
function initSignaturePad() {
  if (signaturePad) return;

  // Resize canvas for sharp rendering
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  padCanvas.width = padCanvas.offsetWidth * ratio;
  padCanvas.height = padCanvas.offsetHeight * ratio;
  padCanvas.getContext("2d").scale(ratio, ratio);

  signaturePad = new window.SignaturePad(padCanvas, {
    minWidth: 1,
    maxWidth: 3,
    penColor: currentInkColor,
  });
}

// Color Switching
colorPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    currentInkColor = pill.dataset.value;
    activatePill(pill.parentElement, currentInkColor);

    if (signaturePad) {
      signaturePad.penColor = currentInkColor;

      // Update existing strokes color
      const data = signaturePad.toData();
      if (data && data.length > 0) {
        data.forEach((group) => {
          group.color = currentInkColor;
        });
        signaturePad.clear();
        signaturePad.fromData(data);
      }
    }

    updateTypePreview();
  });
});

// Mode Switching
modePills.forEach((pill) => {
  pill.addEventListener("click", () => {
    currentMode = pill.dataset.value;
    activatePill(pill.parentElement, currentMode);

    drawControls.style.display = "none";
    uploadControls.style.display = "none";
    typeControls.style.display = "none";

    if (currentMode === "draw") {
      drawControls.style.display = "flex";
      initSignaturePad();
    } else if (currentMode === "upload") {
      uploadControls.style.display = "flex";
    } else if (currentMode === "type") {
      typeControls.style.display = "flex";
    }
  });
});

clearBtn.addEventListener("click", () => {
  if (signaturePad) signaturePad.clear();
});

// Upload Mode
initDropZone(imgDrop, imgUpload, handleImageSelect);

async function handleImageSelect(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (!file.type.startsWith("image/")) {
    showToast("Please upload a valid image file (PNG/JPG).", "error");
    return;
  }
  try {
    uploadedImageSrc = await fileToDataUrl(file);
    imgPreview.src = uploadedImageSrc;
    imgPreview.style.display = "block";
    imgDrop.style.display = "none";
  } catch (err) {
    showToast("Error reading image file.", "error");
  }
}

imgPreview.addEventListener("click", () => {
  imgUpload.click();
});

// Type Mode
function updateTypePreview() {
  const text = typeInput.value || "Your Name";
  const size = fontSizeInput.value;
  fontSizeVal.textContent = size;
  typePreview.style.fontSize = size + "px";
  typePreview.style.color = currentInkColor;
  typePreview.textContent = text;
}

typeInput.addEventListener("input", updateTypePreview);
fontSizeInput.addEventListener("input", updateTypePreview);

function getTypedSignatureAsBase64() {
  const text = typeInput.value || "Your Name";
  const size = parseInt(fontSizeInput.value, 10);

  const ctx = typeCanvas.getContext("2d");
  ctx.font = `${size}px "Dancing Script"`;
  const metrics = ctx.measureText(text);

  const width = Math.ceil(metrics.width) + 20;
  const height = size * 1.5;

  typeCanvas.width = width;
  typeCanvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.font = `${size}px "Dancing Script"`;
  ctx.fillStyle = currentInkColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);

  return typeCanvas.toDataURL("image/png");
}

// PDF Upload & Rendering
initDropZone(dropZone, fileInput, handlePdfSelect);

async function handlePdfSelect(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showToast("Please select a valid PDF file.", "error");
    return;
  }

  fileInfo.textContent = file.name;
  dropZone.style.display = "none";
  optionsBar.classList.add("is-visible");
  previewArea.classList.add("is-visible");

  const arrayBuffer = await file.arrayBuffer();
  pdfBytesOriginal = arrayBuffer;

  if (pdfjsDocument && typeof pdfjsDocument.destroy === "function") {
    try {
      await pdfjsDocument.destroy();
    } catch (_) {}
  }

  // Create a copy of array buffer for PDF.js as web worker transfers data buffer
  const pdfjsBuffer = arrayBuffer.slice(0);

  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfjsBuffer });
    pdfjsDocument = await loadingTask.promise;
    numPages = pdfjsDocument.numPages;
    currentPage = 1;

    initSignaturePad();
    renderPage(currentPage);
  } catch (err) {
    showToast("Error loading PDF.", "error");
    resetTool();
  }
}

async function renderPage(pageNum) {
  loadingOverlay.style.display = "flex";
  pageInfo.textContent = `Page ${pageNum} of ${numPages}`;

  prevPageBtn.disabled = pageNum <= 1;
  nextPageBtn.disabled = pageNum >= numPages;

  let page = null;
  try {
    page = await pdfjsDocument.getPage(pageNum);
    const containerWidth = canvasContainer.clientWidth || 800;

    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    const renderContext = {
      canvasContext: previewCanvas.getContext("2d"),
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    updateOverlayVisibility();
  } catch (err) {
    showToast("Error rendering page preview.", "error");
  } finally {
    if (page && typeof page.cleanup === "function") {
      page.cleanup();
    }
    loadingOverlay.style.display = "none";
  }
}

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
});

nextPageBtn.addEventListener("click", () => {
  if (currentPage < numPages) {
    currentPage++;
    renderPage(currentPage);
  }
});

// Centralized Coordinate Conversion & Placement Helper
export function getPdfSignaturePlacement({
  normX,
  normY,
  normW,
  normH,
  pageWidth,
  pageHeight,
  pageRotation = 0,
  originX = 0,
  originY = 0,
}) {
  const rot = ((pageRotation % 360) + 360) % 360;
  let x, y, width, height, rotateDegrees;

  if (rot === 90) {
    x = originX + (normY + normH) * pageWidth;
    y = originY + normX * pageHeight;
    width = normW * pageHeight;
    height = normH * pageWidth;
    rotateDegrees = 90;
  } else if (rot === 180) {
    x = originX + (1 - normX) * pageWidth;
    y = originY + (normY + normH) * pageHeight;
    width = normW * pageWidth;
    height = normH * pageHeight;
    rotateDegrees = 180;
  } else if (rot === 270) {
    x = originX + (1 - normY - normH) * pageWidth;
    y = originY + (1 - normX) * pageHeight;
    width = normW * pageHeight;
    height = normH * pageWidth;
    rotateDegrees = 270;
  } else {
    // 0 degrees
    x = originX + normX * pageWidth;
    y = originY + pageHeight - (normY + normH) * pageHeight;
    width = normW * pageWidth;
    height = normH * pageHeight;
    rotateDegrees = 0;
  }

  return { x, y, width, height, rotateDegrees };
}

export function updateOverlayPixelPosition(overlay, sig, cW, cH) {
  if (!overlay || !sig || !cW || !cH) return;
  const left = sig.normX * cW;
  const top = sig.normY * cH;
  const width = sig.normW * cW;
  const height = sig.normH * cH;

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
}

// Signature State Management
const signatures = new Map();

export function getSignatures() {
  return signatures;
}

// Signature Overlay Logic
let overlayIdCounter = 0;

placeBtn.addEventListener("click", () => {
  let imgSrc = null;

  if (currentMode === "draw") {
    if (signaturePad && !signaturePad.isEmpty()) {
      imgSrc = signaturePad.toDataURL("image/png");
    } else {
      showToast("Please draw a signature first.", "error");
      return;
    }
  } else if (currentMode === "upload") {
    if (uploadedImageSrc) {
      imgSrc = uploadedImageSrc;
    } else {
      showToast("Please upload an image first.", "error");
      return;
    }
  } else if (currentMode === "type") {
    if (typeInput.value.trim() === "") {
      showToast("Please type your name.", "error");
      return;
    }
    imgSrc = getTypedSignatureAsBase64();
  }

  if (imgSrc) {
    createSignatureOverlay(imgSrc);
    optionsBar.scrollIntoView({ behavior: "smooth" });
  }
});

function deselectAllSignatures() {
  document.querySelectorAll(".signature-overlay.selected").forEach((overlay) => {
    overlay.classList.remove("selected");
  });
}

function selectSignature(overlay) {
  deselectAllSignatures();
  overlay.classList.add("selected");
}

document.addEventListener("click", (e) => {
  const overlays = document.querySelectorAll(".signature-overlay");
  if (overlays.length === 0) return;

  const clickedOverlay = e.target.closest(".signature-overlay");
  const clickedPlaceBtn = e.target.closest("#sign-place-btn");

  if (!clickedOverlay && !clickedPlaceBtn) {
    deselectAllSignatures();
  }
});

function createSignatureOverlay(src) {
  const overlay = document.createElement("div");
  overlay.className = "signature-overlay";
  const id = `sig-${overlayIdCounter++}`;
  overlay.dataset.id = id;
  overlay.dataset.page = String(currentPage); // Remember which page it was placed on

  selectSignature(overlay);

  overlay.addEventListener("mousedown", () => selectSignature(overlay));
  overlay.addEventListener("touchstart", () => selectSignature(overlay), { passive: true });

  const img = document.createElement("img");
  img.src = src;

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  resizeHandle.setAttribute("aria-label", "Resize signature");
  resizeHandle.setAttribute("title", "Resize signature");

  const deleteBtn = document.createElement("div");
  deleteBtn.className = "delete-handle";
  deleteBtn.setAttribute("role", "button");
  deleteBtn.setAttribute("tabindex", "0");
  deleteBtn.setAttribute("aria-label", "Remove signature");
  deleteBtn.setAttribute("title", "Remove signature");
  deleteBtn.textContent = "✕";

  const removeHandler = (e) => {
    e.stopPropagation();
    signatures.delete(id);
    overlay.remove();
  };
  deleteBtn.addEventListener("click", removeHandler);
  deleteBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      removeHandler(e);
    }
  });

  overlay.appendChild(img);
  overlay.appendChild(resizeHandle);
  overlay.appendChild(deleteBtn);

  canvasContainer.appendChild(overlay);

  // Initialize immediately with default normalized geometry
  const cWInit = previewCanvas.clientWidth || previewCanvas.offsetWidth || 800;
  const cHInit = previewCanvas.clientHeight || previewCanvas.offsetHeight || 600;
  const defaultW = Math.min(200, cWInit * 0.5);
  const defaultH = defaultW * 0.5;
  const initLeft = Math.max(0, (cWInit - defaultW) / 2);
  const initTop = Math.max(0, (cHInit - defaultH) / 2);

  const sig = {
    id,
    pageNum: currentPage,
    src,
    normX: initLeft / cWInit,
    normY: initTop / cHInit,
    normW: defaultW / cWInit,
    normH: defaultH / cHInit,
    aspectRatio: defaultW / defaultH,
  };
  signatures.set(id, sig);

  overlay.dataset.normX = String(sig.normX);
  overlay.dataset.normY = String(sig.normY);
  overlay.dataset.normW = String(sig.normW);
  overlay.dataset.normH = String(sig.normH);

  updateOverlayPixelPosition(overlay, sig, cWInit, cHInit);

  // Refine geometry once natural dimensions load
  img.onload = () => {
    const currentCW = previewCanvas.clientWidth || previewCanvas.offsetWidth || 800;
    const currentCH = previewCanvas.clientHeight || previewCanvas.offsetHeight || 600;

    let naturalW = img.naturalWidth || 200;
    let naturalH = img.naturalHeight || 100;
    const aspect = naturalW / naturalH;

    const maxW = currentCW * 0.5;
    let w = naturalW;
    let h = naturalH;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    if (h > currentCH * 0.8) {
      h = currentCH * 0.8;
      w = h * aspect;
    }

    const left = Math.max(0, (currentCW - w) / 2);
    const top = Math.max(0, (currentCH - h) / 2);

    sig.normX = left / currentCW;
    sig.normY = top / currentCH;
    sig.normW = w / currentCW;
    sig.normH = h / currentCH;
    sig.aspectRatio = aspect;

    overlay.dataset.normX = String(sig.normX);
    overlay.dataset.normY = String(sig.normY);
    overlay.dataset.normW = String(sig.normW);
    overlay.dataset.normH = String(sig.normH);

    updateOverlayPixelPosition(overlay, sig, currentCW, currentCH);
  };

  makeDraggableAndResizable(overlay, resizeHandle);
}

function makeDraggableAndResizable(overlay, resizeHandle) {
  makeDraggable(overlay, resizeHandle);
  makeResizable(overlay, resizeHandle);
}

function makeDraggable(overlay, resizeHandle) {
  let isDragging = false;
  let startX, startY;
  let startLeft, startTop;

  overlay.addEventListener("mousedown", startDrag);
  overlay.addEventListener("touchstart", startDrag, { passive: false });

  function startDrag(e) {
    if (
      e.target === resizeHandle ||
      e.target.classList.contains("delete-handle")
    )
      return;

    isDragging = true;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;

    startX = clientX;
    startY = clientY;
    startLeft = parseInt(overlay.style.left || 0, 10);
    startTop = parseInt(overlay.style.top || 0, 10);

    document.addEventListener("mousemove", drag);
    document.addEventListener("touchmove", drag, { passive: false });
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);

    if (e.type.includes("touch")) e.preventDefault();
  }

  function drag(e) {
    if (!isDragging) return;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // Constrain strictly to preview canvas content bounds
    const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
    const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;
    const oW = overlay.offsetWidth;
    const oH = overlay.offsetHeight;

    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft + oW > cW) newLeft = Math.max(0, cW - oW);
    if (newTop + oH > cH) newTop = Math.max(0, cH - oH);

    overlay.style.left = `${newLeft}px`;
    overlay.style.top = `${newTop}px`;

    if (e.type.includes("touch")) e.preventDefault();
  }

  function endDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", drag);
    document.removeEventListener("touchmove", drag);
    document.removeEventListener("mouseup", endDrag);
    document.removeEventListener("touchend", endDrag);

    const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
    const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;
    if (cW > 0 && cH > 0) {
      const curLeft = parseFloat(overlay.style.left) || 0;
      const curTop = parseFloat(overlay.style.top) || 0;
      const id = overlay.dataset ? overlay.dataset.id : null;
      if (id) {
        const sig = signatures.get(id);
        if (sig) {
          sig.normX = curLeft / cW;
          sig.normY = curTop / cH;
        }
      }
      if (overlay.dataset) {
        overlay.dataset.normX = String(curLeft / cW);
        overlay.dataset.normY = String(curTop / cH);
      }
    }
  }
}

function makeResizable(overlay, resizeHandle) {
  let isResizing = false;
  let startX, startY;
  let startWidth, startHeight;

  resizeHandle.addEventListener("mousedown", startResize);
  resizeHandle.addEventListener("touchstart", startResize, { passive: false });

  function startResize(e) {
    isResizing = true;
    e.stopPropagation();

    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;

    startX = clientX;
    startY = clientY;
    startWidth = overlay.offsetWidth;
    startHeight = overlay.offsetHeight;

    document.addEventListener("mousemove", resize);
    document.addEventListener("touchmove", resize, { passive: false });
    document.addEventListener("mouseup", endResize);
    document.addEventListener("touchend", endResize);

    if (e.type.includes("touch")) e.preventDefault();
  }

  function resize(e) {
    if (!isResizing) return;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;

    const dx = clientX - startX;

    const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
    const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;
    const curLeft = parseFloat(overlay.style.left) || 0;
    const curTop = parseFloat(overlay.style.top) || 0;

    const id = overlay.dataset ? overlay.dataset.id : null;
    const sig = id ? signatures.get(id) : null;
    const aspect = (sig && sig.aspectRatio) ? sig.aspectRatio : (startWidth / startHeight);

    let newWidth = Math.max(30, startWidth + dx);
    if (newWidth + curLeft > cW) {
      newWidth = Math.max(30, cW - curLeft);
    }
    let newHeight = newWidth / aspect;
    if (newHeight + curTop > cH) {
      newHeight = Math.max(15, cH - curTop);
      newWidth = newHeight * aspect;
    }

    overlay.style.width = `${newWidth}px`;
    overlay.style.height = `${newHeight}px`;

    if (e.type.includes("touch")) e.preventDefault();
  }

  function endResize() {
    isResizing = false;
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("touchmove", resize);
    document.removeEventListener("mouseup", endResize);
    document.removeEventListener("touchend", endResize);

    const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
    const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;
    if (cW > 0 && cH > 0) {
      const curW = parseFloat(overlay.style.width) || 30;
      const curH = parseFloat(overlay.style.height) || 15;
      const id = overlay.dataset ? overlay.dataset.id : null;
      if (id) {
        const sig = signatures.get(id);
        if (sig) {
          sig.normW = curW / cW;
          sig.normH = curH / cH;
        }
      }
      if (overlay.dataset) {
        overlay.dataset.normW = String(curW / cW);
        overlay.dataset.normH = String(curH / cH);
      }
    }
  }
}

// Ensure overlays are only visible on their respective pages and positioned accurately
function updateOverlayVisibility() {
  const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
  const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;

  const overlays = document.querySelectorAll(".signature-overlay");
  overlays.forEach((overlay) => {
    const page = parseInt(overlay.dataset.page, 10);
    if (page === currentPage) {
      overlay.style.display = "block";
      const sig = signatures.get(overlay.dataset.id);
      if (sig && cW > 0 && cH > 0) {
        updateOverlayPixelPosition(overlay, sig, cW, cH);
      }
    } else {
      overlay.style.display = "none";
    }
  });
}

export function syncActiveOverlays() {
  if (!previewCanvas || !canvasContainer) return;
  const cW = previewCanvas.clientWidth || previewCanvas.offsetWidth;
  const cH = previewCanvas.clientHeight || previewCanvas.offsetHeight;
  if (!cW || !cH) return;

  const overlays = document.querySelectorAll(".signature-overlay");
  overlays.forEach((overlay) => {
    const page = parseInt(overlay.dataset.page, 10);
    if (page === currentPage) {
      const sig = signatures.get(overlay.dataset.id);
      if (sig) {
        updateOverlayPixelPosition(overlay, sig, cW, cH);
      }
    }
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("resize", syncActiveOverlays);
}
if (typeof ResizeObserver !== "undefined" && canvasContainer) {
  try {
    const resizeObserver = new ResizeObserver(() => {
      syncActiveOverlays();
    });
    if (typeof resizeObserver.observe === "function") {
      resizeObserver.observe(canvasContainer);
    }
  } catch (_) {}
}

const observer = new MutationObserver(updateOverlayVisibility);
observer.observe(pageInfo, {
  childList: true,
  characterData: true,
  subtree: true,
});
// Also trigger on manual change just in case
prevPageBtn.addEventListener("click", updateOverlayVisibility);
nextPageBtn.addEventListener("click", updateOverlayVisibility);

// Download Process
downloadBtn.addEventListener("click", async () => {
  const overlays = document.querySelectorAll(".signature-overlay");
  if (signatures.size === 0 && overlays.length === 0) {
    showToast("Please place at least one signature on the PDF.", "error");
    return;
  }

  // Collect signature data from state or DOM dataset fallback
  const overlayData = [];
  if (signatures.size > 0) {
    signatures.forEach((sig) => {
      overlayData.push({ ...sig });
    });
  } else {
    overlays.forEach((overlay) => {
      const img = overlay.querySelector("img");
      overlayData.push({
        id: overlay.dataset.id || "sig-0",
        pageNum: parseInt(overlay.dataset.page, 10) || 1,
        src: img ? img.src : "",
        normX: parseFloat(overlay.dataset.normX) || 0,
        normY: parseFloat(overlay.dataset.normY) || 0,
        normW: parseFloat(overlay.dataset.normW) || 0.2,
        normH: parseFloat(overlay.dataset.normH) || 0.1,
      });
    });
  }

  if (overlayData.length === 0) {
    showToast("Please place at least one signature on the PDF.", "error");
    return;
  }

  optionsBar.classList.remove("is-visible");
  previewArea.classList.remove("is-visible");
  progressArea.style.display = "flex";
  setProgress(progressBar, progressLabel, 10, "Loading PDF...");

  try {
    const { PDFDocument, degrees } = window.PDFLib || {};
    // Load fresh from original bytes
    const pdfDoc = await PDFDocument.load(pdfBytesOriginal, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    setProgress(progressBar, progressLabel, 40, "Embedding signatures...");

    // We need to embed each image. We cache by src to avoid embedding the same image multiple times
    const embeddedImages = new Map();

    for (let i = 0; i < overlayData.length; i++) {
      const data = overlayData[i];
      if (data.pageNum < 1 || data.pageNum > pages.length) continue;

      const targetPage = pages[data.pageNum - 1];
      const src = data.src;
      if (!src) continue;

      let pdfImage;
      if (embeddedImages.has(src)) {
        pdfImage = embeddedImages.get(src);
      } else {
        // Embed image based on type
        if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) {
          pdfImage = await pdfDoc.embedJpg(src);
        } else {
          pdfImage = await pdfDoc.embedPng(src);
        }
        embeddedImages.set(src, pdfImage);
      }

      const cropBox = typeof targetPage.getCropBox === "function" ? targetPage.getCropBox() : null;
      const mediaBox = typeof targetPage.getMediaBox === "function" ? targetPage.getMediaBox() : null;
      const box = cropBox || mediaBox;

      const pdfW = box ? box.width : targetPage.getWidth();
      const pdfH = box ? box.height : targetPage.getHeight();

      let pageRotation = 0;
      if (typeof targetPage.getRotation === "function") {
        const rotObj = targetPage.getRotation();
        pageRotation = (rotObj && typeof rotObj.angle === "number") ? rotObj.angle : (typeof rotObj === "number" ? rotObj : 0);
      }

      const originX = box ? box.x : ((typeof targetPage.getX === "function") ? targetPage.getX() : 0);
      const originY = box ? box.y : ((typeof targetPage.getY === "function") ? targetPage.getY() : 0);

      const placement = getPdfSignaturePlacement({
        normX: data.normX,
        normY: data.normY,
        normW: data.normW,
        normH: data.normH,
        pageWidth: pdfW,
        pageHeight: pdfH,
        pageRotation,
        originX,
        originY,
      });

      const rotateOption = degrees
        ? degrees(placement.rotateDegrees)
        : { angle: placement.rotateDegrees, type: "degrees" };

      targetPage.drawImage(pdfImage, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotate: rotateOption,
      });

      setProgress(
        progressBar,
        progressLabel,
        40 + Math.floor((i / overlayData.length) * 40),
        `Applying signature ${i + 1}/${overlayData.length}...`,
      );
    }

    setProgress(progressBar, progressLabel, 85, "Saving PDF...");
    const modifiedPdfBytes = await pdfDoc.save();

    setProgress(progressBar, progressLabel, 100, "Done!");
    setTimeout(() => {
      progressArea.style.display = "none";
      resultsArea.classList.add("is-visible");

      const blob = new Blob([modifiedPdfBytes], { type: "application/pdf" });

      if (currentDownloadUrl) {
        URL.revokeObjectURL(currentDownloadUrl);
      }
      currentDownloadUrl = URL.createObjectURL(blob);

      downloadFinalBtn.onclick = () => {
        const safeName = fileInfo.textContent
          .replace(".pdf", "")
          .replace(/[\/\\]/g, "_");
        triggerDownload(currentDownloadUrl, `${safeName}_signed.pdf`, true);
        currentDownloadUrl = null;
      };
    }, 500);
  } catch (err) {
    showToast("An error occurred while saving the PDF.", "error");
    progressArea.style.display = "none";
    optionsBar.classList.add("is-visible");
    previewArea.classList.add("is-visible");
  }
});

function resetTool() {
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }

  signatures.clear();

  pdfBytesOriginal = null;
  if (pdfjsDocument && typeof pdfjsDocument.destroy === "function") {
    try {
      pdfjsDocument.destroy();
    } catch (_) {}
  }
  pdfjsDocument = null;
  uploadedImageSrc = null;
  if (signaturePad) signaturePad.clear();

  document.querySelectorAll(".signature-overlay").forEach((el) => el.remove());

  imgPreview.src = "";
  imgPreview.style.display = "none";
  imgDrop.style.display = "flex";
  typeInput.value = "";
  updateTypePreview();

  currentMode = "draw";
  currentInkColor = "#000000";
  activatePill(document.getElementById("sign-mode-pills"), "draw");
  activatePill(document.getElementById("sign-color-pills"), "#000000");

  dropZone.style.display = "flex";
  optionsBar.classList.remove("is-visible");
  previewArea.classList.remove("is-visible");
  progressArea.style.display = "none";
  resultsArea.classList.remove("is-visible");
  fileInput.value = "";
}

resetBtn.addEventListener("click", resetTool);
