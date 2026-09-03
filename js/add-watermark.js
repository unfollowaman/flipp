import {
  initDropZone,
  showToast,
  setProgress,
  activatePill,
  fileToDataUrl,
} from "./drag-drop.js";

let currentPdfBuffer = null;
let currentPdfDoc = null; // pdf.js document
let uploadedImageURL = null;

let currentPage = 1;
let numPages = 1;

// Configuration state
let pageConfigs = {}; // pageNumber -> { position, customX, customY, fontSize, scale }
let globalWatermarkConfig = {
  position: "center",
  customX: null,
  customY: null,
};

let isSelected = true;
let isDragging = false;
let isResizing = false;
let activeHandle = null;
let dragOffset = { x: 0, y: 0 };
let initialLocalDist = 1;
let initialFontSize = 48;
let initialScale = 1.0;
let pendingChangePage = null;

const dropZone = document.getElementById("wm-drop-zone");
const fileInput = document.getElementById("wm-file-input");
const optionsBar = document.getElementById("wm-options");
const previewArea = document.getElementById("wm-preview-area");
const progressArea = document.getElementById("wm-progress");
const progressBar = document.getElementById("wm-progress-bar");
const progressLabel = document.getElementById("wm-progress-label");
const resultsArea = document.getElementById("wm-results");
const fileInfo = document.getElementById("wm-file-info");
const previewCanvas = document.getElementById("wm-preview-canvas");
const ctx = previewCanvas.getContext("2d");
const convertBtn = document.getElementById("wm-convert-btn");
const downloadBtn = document.getElementById("wm-download-btn");
const resetBtn = document.getElementById("wm-reset-btn");
const loadingOverlay = document.getElementById("wm-loading-overlay");

const prevPageBtn = document.getElementById("wm-prev-page");
const nextPageBtn = document.getElementById("wm-next-page");
const applyScopePrompt = document.getElementById("wm-apply-scope-prompt");
const applyPageOnlyBtn = document.getElementById("wm-apply-page-only-btn");
const applyAllPagesBtn = document.getElementById("wm-apply-all-pages-btn");

// UI Controls
const modePills = document.querySelectorAll("#wm-mode-pills .opt-pill");
const textControls = document.getElementById("wm-text-controls");
const imageControls = document.getElementById("wm-image-controls");

// Settings Inputs
const textInput = document.getElementById("wm-text-input");
const fontSizeInput = document.getElementById("wm-font-size");
const colorInput = document.getElementById("wm-color");

const imageUpload = document.getElementById("wm-image-upload");
const imagePreview = document.getElementById("wm-image-preview");
const scaleInput = document.getElementById("wm-scale");

const opacityInput = document.getElementById("wm-opacity");
const rotationInput = document.getElementById("wm-rotation");
const positionSelect = document.getElementById("wm-position");

// Display values
const fontSizeVal = document.getElementById("wm-font-size-val");
const scaleVal = document.getElementById("wm-scale-val");
const opacityVal = document.getElementById("wm-opacity-val");
const rotationVal = document.getElementById("wm-rotation-val");

let fileName = "document.pdf";
let currentMode = "text";

// Initialize
initDropZone(dropZone, fileInput, handleFile);

// Update value displays
fontSizeInput.addEventListener("input", (e) => {
  fontSizeVal.textContent = e.target.value;
  if (pageConfigs[currentPage]) {
    pageConfigs[currentPage].fontSize = parseInt(e.target.value);
  }
  schedulePreviewUpdate();
});

scaleInput.addEventListener("input", (e) => {
  scaleVal.textContent = parseFloat(e.target.value).toFixed(1);
  if (pageConfigs[currentPage]) {
    pageConfigs[currentPage].scale = parseFloat(e.target.value);
  }
  schedulePreviewUpdate();
});

opacityInput.addEventListener("input", (e) => {
  opacityVal.textContent = e.target.value;
  schedulePreviewUpdate();
});

rotationInput.addEventListener("input", (e) => {
  rotationVal.textContent = e.target.value;
  schedulePreviewUpdate();
});

textInput.addEventListener("input", schedulePreviewUpdate);
colorInput.addEventListener("input", schedulePreviewUpdate);

positionSelect.addEventListener("change", (e) => {
  globalWatermarkConfig.position = e.target.value;
  globalWatermarkConfig.customX = null;
  globalWatermarkConfig.customY = null;
  if (pageConfigs[currentPage]) {
    delete pageConfigs[currentPage].position;
    delete pageConfigs[currentPage].customX;
    delete pageConfigs[currentPage].customY;
  }
  schedulePreviewUpdate();
});

// Navigation controls
if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) goToPage(currentPage - 1);
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    if (currentPage < numPages) goToPage(currentPage + 1);
  });
}

// Scope Prompt Buttons
if (applyPageOnlyBtn) {
  applyPageOnlyBtn.addEventListener("click", () => {
    applyWatermarkScope("page", pendingChangePage || currentPage);
    if (applyScopePrompt) applyScopePrompt.style.display = "none";
  });
}

if (applyAllPagesBtn) {
  applyAllPagesBtn.addEventListener("click", () => {
    applyWatermarkScope("all", pendingChangePage || currentPage);
    if (applyScopePrompt) applyScopePrompt.style.display = "none";
  });
}

// Mode Switching
modePills.forEach((pill) => {
  pill.addEventListener("click", (e) => {
    activatePill(e.target.parentElement, e.target.dataset.value);
    currentMode = e.target.dataset.value;
    if (currentMode === "text") {
      textControls.style.display = "flex";
      imageControls.style.display = "none";
    } else {
      textControls.style.display = "none";
      imageControls.style.display = "flex";
    }
    schedulePreviewUpdate();
  });
});

// Image Upload Handling
imageUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file && (file.type === "image/png" || file.type === "image/jpeg")) {
    try {
      uploadedImageURL = await fileToDataUrl(file);
      imagePreview.src = uploadedImageURL;
      imagePreview.style.display = "block";
      schedulePreviewUpdate();
    } catch (err) {
      showToast("Error reading image file.", "error");
    }
  }
});

let previewTimeout = null;
function schedulePreviewUpdate() {
  if (!currentPdfDoc) return;
  if (previewTimeout) clearTimeout(previewTimeout);
  previewTimeout = setTimeout(renderPreview, 80);
}

async function handleFile(files) {
  if (files.length === 0) return;
  const file = files[0];
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showToast("Please upload a valid PDF file.", "error");
    return;
  }

  fileName = file.name;
  dropZone.style.display = "none";
  optionsBar.classList.add("is-visible");
  previewArea.classList.add("is-visible");
  fileInfo.textContent = `Loading ${fileName}...`;

  try {
    currentPdfBuffer = await file.arrayBuffer();
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    currentPdfDoc = await pdfjsLib.getDocument({
      data: currentPdfBuffer.slice(0),
    }).promise;

    numPages = currentPdfDoc.numPages;
    currentPage = 1;
    pageConfigs = {};
    globalWatermarkConfig = {
      position: positionSelect.value,
      customX: null,
      customY: null,
    };

    updateNavControls();
    await renderPagePreview(currentPage);
  } catch (err) {
    console.error(err);
    showToast("Error loading PDF.", "error");
    resetApp();
  }
}

function updateNavControls() {
  numPages = currentPdfDoc ? currentPdfDoc.numPages : 1;
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= numPages;
  if (fileInfo) {
    fileInfo.textContent = `${fileName} (Page ${currentPage} of ${numPages})`;
  }
}

async function goToPage(pageNum) {
  if (pageNum < 1 || pageNum > numPages) return;
  currentPage = pageNum;
  if (applyScopePrompt) applyScopePrompt.style.display = "none";
  updateNavControls();
  await renderPagePreview(currentPage);
}

async function renderPagePreview(pageNum) {
  if (!currentPdfDoc) return;
  try {
    loadingOverlay.style.display = "flex";
    const page = await currentPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    await renderPreviewForPage(page, viewport);
  } catch (err) {
    console.error("Error rendering page", err);
  } finally {
    loadingOverlay.style.display = "none";
  }
}

async function renderPreview() {
  await renderPagePreview(currentPage);
}

async function renderPreviewForPage(page, viewport) {
  await page.render({ canvasContext: ctx, viewport }).promise;
  const config = getPageConfig(currentPage);
  drawWatermarkOnCanvas(ctx, viewport.width, viewport.height, config);
}

export function getPageConfig(pageNum) {
  const globalConfig = {
    mode: currentMode,
    text: textInput.value,
    color: colorInput.value,
    opacity: parseInt(opacityInput.value) / 100,
    rotation: parseInt(rotationInput.value),
    position: globalWatermarkConfig.position || positionSelect.value,
    fontSize: parseInt(fontSizeInput.value),
    scale: parseFloat(scaleInput.value),
    customX: globalWatermarkConfig.customX,
    customY: globalWatermarkConfig.customY,
  };

  const pageOverride = pageConfigs[pageNum] || {};
  return { ...globalConfig, ...pageOverride };
}

export function applyWatermarkScope(scope, targetPage = currentPage) {
  if (scope === "all") {
    const pageConf = pageConfigs[targetPage] || {};
    if (pageConf.position) globalWatermarkConfig.position = pageConf.position;
    if (pageConf.customX !== undefined) globalWatermarkConfig.customX = pageConf.customX;
    if (pageConf.customY !== undefined) globalWatermarkConfig.customY = pageConf.customY;
    if (pageConf.fontSize !== undefined) {
      fontSizeInput.value = pageConf.fontSize;
      fontSizeVal.textContent = pageConf.fontSize;
    }
    if (pageConf.scale !== undefined) {
      scaleInput.value = pageConf.scale;
      scaleVal.textContent = pageConf.scale.toFixed(1);
    }
    pageConfigs = {};
    showToast("Applied change to all pages", "info");
  } else {
    showToast(`Applied change to page ${targetPage} only`, "info");
  }
}

function drawWatermarkOnCanvas(ctx, width, height, config) {
  ctx.save();
  ctx.globalAlpha = config.opacity;
  const rotationRad = config.rotation * (Math.PI / 180);

  let geom = null;

  if (config.mode === "text") {
    geom = drawTextWatermarkOnCanvas(ctx, width, height, config, rotationRad);
  } else {
    geom = drawImageWatermarkOnCanvas(ctx, width, height, config, rotationRad);
  }

  ctx.restore();

  if (isSelected && geom && config.position !== "tile") {
    drawSelectionBox(ctx, geom.cx, geom.cy, geom.boxW, geom.boxH, rotationRad);
  }
}

function drawTextWatermarkOnCanvas(ctx, width, height, config, rotationRad) {
  const text = config.text;
  if (!text) return null;

  const fontSizeCanvas = config.fontSize * 1.5;
  ctx.font = `bold ${fontSizeCanvas}px sans-serif`;
  ctx.fillStyle = config.color;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSizeCanvas;

  let centerPos = { x: width / 2, y: height / 2 };

  if (config.position === "custom" || config.customX != null) {
    centerPos = {
      x: (config.customX != null ? config.customX : 0.5) * width,
      y: (config.customY != null ? config.customY : 0.5) * height,
    };
  } else {
    centerPos = getPositionCoordinates(
      config.position,
      width,
      height,
      textWidth,
      textHeight,
    );
  }

  applyWatermarkPattern(
    config.position,
    width,
    height,
    textWidth,
    textHeight,
    100,
    100,
    getPositionCoordinates,
    (x, y) => {
      const drawX = (config.position === "custom" || config.customX != null) ? centerPos.x : x;
      const drawY = (config.position === "custom" || config.customY != null) ? centerPos.y : y;
      drawTextAt(ctx, text, drawX, drawY, rotationRad);
    },
  );

  const pad = 12;
  return {
    cx: centerPos.x,
    cy: centerPos.y,
    boxW: textWidth + pad * 2,
    boxH: textHeight + pad * 2,
  };
}

function drawImageWatermarkOnCanvas(ctx, width, height, config, rotationRad) {
  if (!uploadedImageURL) return null;
  const img = document.getElementById("wm-image-preview");
  if (!img.complete || img.naturalWidth === 0) return null;

  const imgWidth = img.naturalWidth * config.scale;
  const imgHeight = img.naturalHeight * config.scale;

  let centerPos = { x: width / 2, y: height / 2 };

  if (config.position === "custom" || config.customX != null) {
    centerPos = {
      x: (config.customX != null ? config.customX : 0.5) * width,
      y: (config.customY != null ? config.customY : 0.5) * height,
    };
  } else {
    centerPos = getPositionCoordinates(
      config.position,
      width,
      height,
      imgWidth,
      imgHeight,
    );
  }

  applyWatermarkPattern(
    config.position,
    width,
    height,
    imgWidth,
    imgHeight,
    50,
    50,
    getPositionCoordinates,
    (x, y) => {
      const drawX = (config.position === "custom" || config.customX != null) ? centerPos.x : x;
      const drawY = (config.position === "custom" || config.customY != null) ? centerPos.y : y;
      drawImageAt(ctx, img, drawX, drawY, rotationRad, imgWidth, imgHeight);
    },
  );

  const pad = 12;
  return {
    cx: centerPos.x,
    cy: centerPos.y,
    boxW: imgWidth + pad * 2,
    boxH: imgHeight + pad * 2,
  };
}

function drawSelectionBox(ctx, cx, cy, boxW, boxH, rotationRad) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;

  const handleSize = 10;
  const corners = [
    { x: -boxW / 2, y: -boxH / 2 },
    { x: boxW / 2, y: -boxH / 2 },
    { x: -boxW / 2, y: boxH / 2 },
    { x: boxW / 2, y: boxH / 2 },
  ];

  corners.forEach((c) => {
    ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
  });

  ctx.restore();
}

previewCanvas.addEventListener("pointerdown", (e) => {
  if (!currentPdfDoc) return;
  const rect = previewCanvas.getBoundingClientRect();
  const scaleX = previewCanvas.width / rect.width;
  const scaleY = previewCanvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  const config = getPageConfig(currentPage);
  if (config.position === "tile") return;

  const rotationRad = config.rotation * (Math.PI / 180);

  let itemW = 200, itemH = 60;
  if (config.mode === "text") {
    ctx.font = `bold ${config.fontSize * 1.5}px sans-serif`;
    itemW = ctx.measureText(config.text || " ").width;
    itemH = config.fontSize * 1.5;
  } else {
    const img = document.getElementById("wm-image-preview");
    if (img && img.complete && img.naturalWidth > 0) {
      itemW = img.naturalWidth * config.scale;
      itemH = img.naturalHeight * config.scale;
    }
  }

  const pad = 12;
  const boxW = itemW + pad * 2;
  const boxH = itemH + pad * 2;

  let centerPos = { x: previewCanvas.width / 2, y: previewCanvas.height / 2 };
  if (config.position === "custom" || config.customX != null) {
    centerPos = {
      x: (config.customX != null ? config.customX : 0.5) * previewCanvas.width,
      y: (config.customY != null ? config.customY : 0.5) * previewCanvas.height,
    };
  } else {
    centerPos = getPositionCoordinates(config.position, previewCanvas.width, previewCanvas.height, itemW, itemH);
  }

  const dx = px - centerPos.x;
  const dy = py - centerPos.y;
  const invRad = -rotationRad;
  const lx = dx * Math.cos(invRad) - dy * Math.sin(invRad);
  const ly = dx * Math.sin(invRad) + dy * Math.cos(invRad);

  const handleHitRadius = 16;
  const corners = [
    { name: "tl", x: -boxW / 2, y: -boxH / 2 },
    { name: "tr", x: boxW / 2, y: -boxH / 2 },
    { name: "bl", x: -boxW / 2, y: boxH / 2 },
    { name: "br", x: boxW / 2, y: boxH / 2 },
  ];

  let hitHandle = null;
  for (const c of corners) {
    const dist = Math.sqrt(Math.pow(lx - c.x, 2) + Math.pow(ly - c.y, 2));
    if (dist <= handleHitRadius) {
      hitHandle = c.name;
      break;
    }
  }

  if (hitHandle) {
    isResizing = true;
    activeHandle = hitHandle;
    initialLocalDist = Math.sqrt(lx * lx + ly * ly) || 1;
    initialFontSize = config.fontSize;
    initialScale = config.scale;
    isSelected = true;
    previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else if (Math.abs(lx) <= boxW / 2 && Math.abs(ly) <= boxH / 2) {
    isDragging = true;
    dragOffset = { x: px - centerPos.x, y: py - centerPos.y };
    isSelected = true;
    previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});

previewCanvas.addEventListener("pointermove", (e) => {
  if (!isDragging && !isResizing) return;
  const rect = previewCanvas.getBoundingClientRect();
  const scaleX = previewCanvas.width / rect.width;
  const scaleY = previewCanvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  const config = getPageConfig(currentPage);

  if (isDragging) {
    let newCx = px - dragOffset.x;
    let newCy = py - dragOffset.y;

    newCx = Math.max(20, Math.min(previewCanvas.width - 20, newCx));
    newCy = Math.max(20, Math.min(previewCanvas.height - 20, newCy));

    const customX = newCx / previewCanvas.width;
    const customY = newCy / previewCanvas.height;

    pageConfigs[currentPage] = {
      ...(pageConfigs[currentPage] || {}),
      position: "custom",
      customX,
      customY,
    };

    schedulePreviewUpdate();
  } else if (isResizing) {
    const rotationRad = config.rotation * (Math.PI / 180);

    let centerPos = { x: previewCanvas.width / 2, y: previewCanvas.height / 2 };
    if (config.position === "custom" || config.customX != null) {
      centerPos = {
        x: (config.customX != null ? config.customX : 0.5) * previewCanvas.width,
        y: (config.customY != null ? config.customY : 0.5) * previewCanvas.height,
      };
    }

    const dx = px - centerPos.x;
    const dy = py - centerPos.y;
    const invRad = -rotationRad;
    const lx = dx * Math.cos(invRad) - dy * Math.sin(invRad);
    const ly = dx * Math.sin(invRad) + dy * Math.cos(invRad);

    const curDist = Math.sqrt(lx * lx + ly * ly) || 1;
    const factor = curDist / initialLocalDist;

    if (config.mode === "text") {
      let newSize = Math.round(initialFontSize * factor);
      newSize = Math.max(12, Math.min(144, newSize));
      fontSizeInput.value = newSize;
      fontSizeVal.textContent = newSize;
      pageConfigs[currentPage] = {
        ...(pageConfigs[currentPage] || {}),
        fontSize: newSize,
      };
    } else {
      let newScale = Math.round(initialScale * factor * 10) / 10;
      newScale = Math.max(0.1, Math.min(3.0, newScale));
      scaleInput.value = newScale;
      scaleVal.textContent = newScale.toFixed(1);
      pageConfigs[currentPage] = {
        ...(pageConfigs[currentPage] || {}),
        scale: newScale,
      };
    }

    schedulePreviewUpdate();
  }
});

function handlePointerEnd(e) {
  if (isDragging || isResizing) {
    isDragging = false;
    isResizing = false;
    activeHandle = null;
    pendingChangePage = currentPage;
    if (applyScopePrompt) applyScopePrompt.style.display = "flex";
  }
}

previewCanvas.addEventListener("pointerup", handlePointerEnd);
previewCanvas.addEventListener("pointercancel", handlePointerEnd);

function applyWatermarkPattern(
  position,
  width,
  height,
  itemW,
  itemH,
  padX,
  padY,
  getCoordsFn,
  drawFn,
) {
  if (position === "tile") {
    const stepX = itemW + padX;
    const stepY = itemH + padY;
    for (let x = -width; x < width * 2; x += stepX) {
      for (let y = -height; y < height * 2; y += stepY) {
        drawFn(x, y);
      }
    }
  } else {
    const { x, y } = getCoordsFn(position, width, height, itemW, itemH);
    drawFn(x, y);
  }
}

function getPositionCoordinates(position, canvasW, canvasH, itemW, itemH) {
  const padding = 20;
  let x = 0,
    y = 0;

  switch (position) {
    case "center":
      x = canvasW / 2;
      y = canvasH / 2;
      break;
    case "top-left":
      x = padding + itemW / 2;
      y = padding + itemH / 2;
      break;
    case "top-right":
      x = canvasW - padding - itemW / 2;
      y = padding + itemH / 2;
      break;
    case "bottom-left":
      x = padding + itemW / 2;
      y = canvasH - padding - itemH / 2;
      break;
    case "bottom-right":
      x = canvasW - padding - itemW / 2;
      y = canvasH - padding - itemH / 2;
      break;
    case "custom":
      x = canvasW / 2;
      y = canvasH / 2;
      break;
  }
  return { x, y };
}

function drawTextAt(ctx, text, x, y, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawImageAt(ctx, img, x, y, rotation, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// --- PDF Generation using pdf-lib ---

let processedPdfBytes = null;

convertBtn.addEventListener("click", async () => {
  if (!currentPdfBuffer) return;

  if (currentMode === "image" && !uploadedImageURL) {
    showToast("Please upload an image for the watermark.", "error");
    return;
  }

  optionsBar.classList.remove("is-visible");
  previewArea.classList.remove("is-visible");
  progressArea.style.display = "block";

  try {
    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib;

    const pdfDoc = await PDFDocument.load(currentPdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pdfNumPages = pages.length;

    let font, hexColor, defaultPdfColor, wmImage;

    if (currentMode === "text") {
      font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      hexColor = colorInput.value;
      const r = parseInt(hexColor.slice(1, 3), 16) / 255;
      const g = parseInt(hexColor.slice(3, 5), 16) / 255;
      const b = parseInt(hexColor.slice(5, 7), 16) / 255;
      defaultPdfColor = rgb(r, g, b);
    } else {
      if (uploadedImageURL.startsWith("data:image/png")) {
        wmImage = await pdfDoc.embedPng(uploadedImageURL);
      } else if (
        uploadedImageURL.startsWith("data:image/jpeg") ||
        uploadedImageURL.startsWith("data:image/jpg")
      ) {
        wmImage = await pdfDoc.embedJpg(uploadedImageURL);
      } else {
        throw new Error("Unsupported image format");
      }
    }

    const textDimensionCache = new Map();
    const getTextDimensions = (text, fontSize) => {
      const cacheKey = `${text}_${fontSize}`;
      if (!textDimensionCache.has(cacheKey)) {
        textDimensionCache.set(cacheKey, {
          textWidth: font.widthOfTextAtSize(text, fontSize),
          textHeight: font.heightAtSize(fontSize),
        });
      }
      return textDimensionCache.get(cacheKey);
    };

    for (let i = 0; i < pdfNumPages; i++) {
      const pageNum = i + 1;
      setProgress(
        progressBar,
        progressLabel,
        (i / pdfNumPages) * 100,
        `Applying watermark to page ${pageNum} of ${pdfNumPages}...`,
      );

      const page = pages[i];
      const { width, height } = page.getSize();
      const pageConfig = getPageConfig(pageNum);

      const opacity = pageConfig.opacity;
      const rotationDeg = pageConfig.rotation;
      const rotation = degrees(-rotationDeg);
      const position = pageConfig.position;

      if (currentMode === "text") {
        const text = pageConfig.text;
        if (!text) continue;
        const fontSize = pageConfig.fontSize;
        const { textWidth, textHeight } = getTextDimensions(text, fontSize);

        let pdfColor = defaultPdfColor;
        if (pageConfig.color && pageConfig.color !== colorInput.value) {
          const r = parseInt(pageConfig.color.slice(1, 3), 16) / 255;
          const g = parseInt(pageConfig.color.slice(3, 5), 16) / 255;
          const b = parseInt(pageConfig.color.slice(5, 7), 16) / 255;
          pdfColor = rgb(r, g, b);
        }

        const getCoords = (pos, w, h, iw, ih) => {
          if (pos === "custom" || pageConfig.customX != null) {
            const cx = (pageConfig.customX != null ? pageConfig.customX : 0.5) * w;
            const cy = (1 - (pageConfig.customY != null ? pageConfig.customY : 0.5)) * h;
            return { x: cx, y: cy };
          }
          return getPdfCoordinates(pos, w, h, iw, ih);
        };

        applyWatermarkPattern(
          position,
          width,
          height,
          textWidth,
          textHeight,
          100,
          100,
          getCoords,
          (x, y) => {
            const { dx, dy } = getPdfPositionOffset(
              x,
              y,
              textWidth,
              textHeight,
              rotationDeg,
            );
            page.drawText(text, {
              x: dx,
              y: dy,
              size: fontSize,
              font: font,
              color: pdfColor,
              opacity: opacity,
              rotate: rotation,
            });
          },
        );
      } else {
        if (!wmImage) continue;
        const imageDims = wmImage.scale(pageConfig.scale);
        const imgW = imageDims.width;
        const imgH = imageDims.height;

        const getCoords = (pos, w, h, iw, ih) => {
          if (pos === "custom" || pageConfig.customX != null) {
            const cx = (pageConfig.customX != null ? pageConfig.customX : 0.5) * w;
            const cy = (1 - (pageConfig.customY != null ? pageConfig.customY : 0.5)) * h;
            return { x: cx, y: cy };
          }
          return getPdfCoordinates(pos, w, h, iw, ih);
        };

        applyWatermarkPattern(
          position,
          width,
          height,
          imgW,
          imgH,
          50,
          50,
          getCoords,
          (x, y) => {
            const { dx, dy } = getPdfPositionOffset(
              x,
              y,
              imgW,
              imgH,
              rotationDeg,
            );
            page.drawImage(wmImage, {
              x: dx,
              y: dy,
              width: imgW,
              height: imgH,
              opacity: opacity,
              rotate: rotation,
            });
          },
        );
      }

      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setProgress(progressBar, progressLabel, 100, "Saving PDF...");
    await new Promise((r) => setTimeout(r, 0));

    processedPdfBytes = await pdfDoc.save();

    progressArea.style.display = "none";
    resultsArea.classList.add("is-visible");
  } catch (err) {
    console.error("Error applying watermark:", err);
    showToast("An error occurred applying the watermark.", "error");
    resetApp();
  }
});

export function getPdfCoordinates(position, width, height, itemW, itemH) {
  const padding = 20;
  let x = 0,
    y = 0;

  switch (position) {
    case "center":
      x = width / 2;
      y = height / 2;
      break;
    case "top-left":
      x = padding + itemW / 2;
      y = height - padding - itemH / 2;
      break;
    case "top-right":
      x = width - padding - itemW / 2;
      y = height - padding - itemH / 2;
      break;
    case "bottom-left":
      x = padding + itemW / 2;
      y = padding + itemH / 2;
      break;
    case "bottom-right":
      x = width - padding - itemW / 2;
      y = padding + itemH / 2;
      break;
  }
  return { x, y };
}

export function getPdfPositionOffset(cx, cy, itemW, itemH, rotationDeg) {
  const rad = rotationDeg * (Math.PI / 180);
  const dx0 = -itemW / 2;
  const dy0 = -itemH / 2;

  const angle = -rad;
  const dxRot = dx0 * Math.cos(angle) - dy0 * Math.sin(angle);
  const dyRot = dx0 * Math.sin(angle) + dy0 * Math.cos(angle);

  return {
    dx: cx + dxRot,
    dy: cy + dyRot,
  };
}

downloadBtn.addEventListener("click", () => {
  if (!processedPdfBytes) return;
  const blob = new Blob([processedPdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeFileName = fileName.replace(".pdf", "").replace(/[\/\\]/g, "_");
  a.download = `${safeFileName}-watermarked.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener("click", resetApp);

function resetApp() {
  currentPdfBuffer = null;
  currentPdfDoc = null;
  processedPdfBytes = null;
  fileName = "";
  currentPage = 1;
  numPages = 1;
  pageConfigs = {};
  globalWatermarkConfig = { position: "center", customX: null, customY: null };

  if (applyScopePrompt) applyScopePrompt.style.display = "none";
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  dropZone.style.display = "block";
  optionsBar.classList.remove("is-visible");
  previewArea.classList.remove("is-visible");
  progressArea.style.display = "none";
  resultsArea.classList.remove("is-visible");

  fileInput.value = "";
}
