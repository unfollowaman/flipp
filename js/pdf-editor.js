import { initDropZone, showToast, setProgress, fileToDataUrl, triggerDownload, activatePill } from "./drag-drop.js";

// Module State
let pdfjsDocument = null;
let pdfBytesOriginal = null;
let numPages = 0;
let currentPageIndex = 1;
let fileName = "document.pdf";

let zoomLevel = 1.0;
let activeTool = "select"; // 'select', 'text', 'highlight', 'draw', 'shape', 'image', 'note', 'signature'
let selectedObjId = null;

// Editor Objects Array
let editorObjects = [];

// History Stack for Undo/Redo
let historyStack = [];
let redoStack = [];

let currentDownloadUrl = null;

// Signature Modal State
let signaturePad = null;
let currentSigMode = "draw";
let currentSigColor = "#000000";
let uploadedSigSrc = null;

// Page metrics cache: pageNum -> { pageViewport, pdfWidth, pdfHeight }
const pageMetricsCache = new Map();

// DOM References
const editorHeader = document.getElementById("editor-header");
const dropZone = document.getElementById("editor-drop-zone");
const fileInput = document.getElementById("editor-file-input");

const workspaceContainer = document.getElementById("editor-workspace");
const filenameInput = document.getElementById("editor-filename-input");
const shareBtn = document.getElementById("editor-share-btn");
const pageIndicator = document.getElementById("editor-page-indicator");
const prevPageBtn = document.getElementById("editor-prev-page");
const nextPageBtn = document.getElementById("editor-next-page");
const zoomValLabel = document.getElementById("editor-zoom-val");
const zoomInBtn = document.getElementById("editor-zoom-in");
const zoomOutBtn = document.getElementById("editor-zoom-out");
const undoBtn = document.getElementById("editor-undo-btn");
const redoBtn = document.getElementById("editor-redo-btn");

const toolbar = document.getElementById("editor-toolbar");
const propsBar = document.getElementById("editor-props-bar");
const pagesScrollArea = document.getElementById("editor-pages-scroll");

const exportBtn = document.getElementById("editor-export-btn");
const progressArea = document.getElementById("editor-progress");
const progressBar = document.getElementById("editor-progress-bar");
const progressLabel = document.getElementById("editor-progress-label");
const resultsArea = document.getElementById("editor-results");
const downloadFinalBtn = document.getElementById("editor-download-final-btn");
const resetBtn = document.getElementById("editor-reset-btn");
const deleteObjBtn = document.getElementById("editor-delete-obj");

// Property Controls
const propFontSize = document.getElementById("prop-font-size");
const propFontFamily = document.getElementById("prop-font-family");
const propBold = document.getElementById("prop-bold");
const propItalic = document.getElementById("prop-italic");
const propColor = document.getElementById("prop-color");
const propShapeType = document.getElementById("prop-shape-type");
const propFillColor = document.getElementById("prop-fill-color");
const propTransparentFill = document.getElementById("prop-transparent-fill");
const propStrokeWidth = document.getElementById("prop-stroke-width");
const propOpacity = document.getElementById("prop-opacity");

const propTextGroup = document.querySelectorAll(".prop-group-text");
const propColorGroup = document.querySelectorAll(".prop-group-color");
const propShapeGroup = document.querySelectorAll(".prop-group-shape");
const propStrokeGroup = document.querySelectorAll(".prop-group-stroke");
const propOpacityGroup = document.querySelectorAll(".prop-group-opacity");

// Signature Modal
const sigModal = document.getElementById("editor-sig-modal");
const sigPadCanvas = document.getElementById("sig-pad-canvas");
const sigClearBtn = document.getElementById("sig-clear-btn");
const sigTypeInput = document.getElementById("sig-type-input");
const sigTypePreview = document.getElementById("sig-type-preview");
const sigTypeCanvas = document.getElementById("sig-type-canvas");
const sigFileInput = document.getElementById("sig-file-input");
const sigUploadPreview = document.getElementById("sig-upload-preview");
const sigCancelBtn = document.getElementById("sig-cancel-btn");
const sigPlaceBtn = document.getElementById("sig-place-btn");
const sigModePills = document.querySelectorAll("#sig-mode-pills .opt-pill");
const sigColorPills = document.querySelectorAll("#sig-color-pills .opt-pill");

const pdfjsLib = window["pdfjs-dist/build/pdf"];

// Initialize Drop Zone
if (dropZone && fileInput) {
  initDropZone(dropZone, fileInput, handlePdfSelect);
}

// ── Centralized Coordinate Conversion Helpers ──────────────────────

export function domToPdfCoords(domRect, pageViewport, pdfSize) {
  const scaleX = pdfSize.width / pageViewport.width;
  const scaleY = pdfSize.height / pageViewport.height;

  const pdfW = domRect.width * scaleX;
  const pdfH = domRect.height * scaleY;
  const pdfX = domRect.x * scaleX;
  const pdfY = pdfSize.height - domRect.y * scaleY - pdfH;

  return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
}

// Helper to parse hex color string to pdf-lib RGB color object
function hexToPdfRgb(hex) {
  if (!hex || hex === "none") return null;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  if (isNaN(num)) return null;
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return window.PDFLib ? window.PDFLib.rgb(r, g, b) : { r, g, b };
}

// ── PDF File Selection & Rendering ──────────────────────────────────

export async function handlePdfSelect(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showToast("Couldn't open this PDF. The file may be damaged or unsupported.", "error");
    return;
  }

  fileName = file.name;
  if (filenameInput) filenameInput.value = fileName;

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfBytesOriginal = arrayBuffer;

    if (editorHeader) editorHeader.style.display = "none";
    if (dropZone) dropZone.style.display = "none";
    if (workspaceContainer) workspaceContainer.style.display = "flex";

    await loadPdfFromBytes(arrayBuffer);
  } catch (err) {
    if (err && err.name === "PasswordException") {
      showToast("This PDF is password protected. Unlock it first, then open it in the editor.", "error");
    } else {
      showToast("Couldn't open this PDF. The file may be damaged or unsupported.", "error");
    }
    resetEditor();
  }
}

export async function loadPdfFromBytes(arrayBuffer) {
  if (!pdfjsLib) {
    showToast("PDF library not ready. Please try again.", "error");
    return;
  }

  if (pdfjsDocument && typeof pdfjsDocument.destroy === "function") {
    try {
      await pdfjsDocument.destroy();
    } catch (_) {}
    pdfjsDocument = null;
  }

  const pdfjsBuffer = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: pdfjsBuffer });
  pdfjsDocument = await loadingTask.promise;

  numPages = pdfjsDocument.numPages;
  currentPageIndex = 1;
  if (pageIndicator) pageIndicator.textContent = `1 / ${numPages}`;

  editorObjects = [];
  historyStack = [];
  redoStack = [];
  updateUndoRedoUI();

  await renderAllPages();
}

export async function renderAllPages() {
  if (!pdfjsDocument) return;

  pagesScrollArea.innerHTML = "";
  pageMetricsCache.clear();

  const pagePromises = [];
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    pagePromises.push(pdfjsDocument.getPage(pageNum));
  }
  const pages = await Promise.all(pagePromises);

  const scrollAreaW = pagesScrollArea.clientWidth;
  const availableW = scrollAreaW > 48 ? scrollAreaW - 48 : 800;
  const maxContainerW = Math.min(availableW, 900);
  const dpr = window.devicePixelRatio || 1;

  const renderPromises = pages.map((page, index) => {
    const pageNum = index + 1;
    const unscaledViewport = page.getViewport({ scale: 1 });

    const baseScale = maxContainerW / unscaledViewport.width;
    const finalScale = baseScale * zoomLevel;

    const viewport = page.getViewport({ scale: finalScale });

    pageMetricsCache.set(pageNum, {
      pageViewport: viewport,
      pdfWidth: unscaledViewport.width,
      pdfHeight: unscaledViewport.height,
    });

    const pageWrapper = document.createElement("div");
    pageWrapper.className = "pdf-page-wrapper";
    pageWrapper.dataset.pageNum = pageNum;
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const overlay = document.createElement("div");
    overlay.className = "pdf-page-overlay";
    overlay.dataset.pageNum = pageNum;

    const badge = document.createElement("div");
    badge.className = "pdf-page-badge";
    badge.textContent = `Page ${pageNum}`;

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(overlay);
    pageWrapper.appendChild(badge);
    pagesScrollArea.appendChild(pageWrapper);

    setupOverlayEvents(overlay, pageNum);

    return (async () => {
      try {
        await page.render({ canvasContext: ctx, viewport }).promise;
      } finally {
        if (page && typeof page.cleanup === "function") {
          page.cleanup();
        }
      }
    })();
  });

  await Promise.all(renderPromises);

  renderAllObjects();
}

// ── Page Navigation Controls ─────────────────────────────────────

function scrollToPage(pageNum) {
  if (!pagesScrollArea) return;
  const target = pagesScrollArea.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPageIndex > 1) {
      scrollToPage(currentPageIndex - 1);
    }
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    if (currentPageIndex < numPages) {
      scrollToPage(currentPageIndex + 1);
    }
  });
}

if (pagesScrollArea) {
  pagesScrollArea.addEventListener("scroll", () => {
    const wrappers = pagesScrollArea.querySelectorAll(".pdf-page-wrapper");
    if (!wrappers.length) return;
    const containerTop = pagesScrollArea.getBoundingClientRect().top;
    let closestPage = 1;
    let minDiff = Infinity;
    wrappers.forEach((w) => {
      const diff = Math.abs(w.getBoundingClientRect().top - containerTop);
      if (diff < minDiff) {
        minDiff = diff;
        closestPage = parseInt(w.dataset.pageNum, 10);
      }
    });
    if (closestPage !== currentPageIndex) {
      currentPageIndex = closestPage;
      if (pageIndicator) pageIndicator.textContent = `${currentPageIndex} / ${numPages}`;
    }
  });
}

// ── Zoom Controls ──────────────────────────────────────────────────

function updateZoom(newZoom) {
  zoomLevel = Math.max(0.25, Math.min(3.0, newZoom));
  if (zoomValLabel) {
    zoomValLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
  renderAllPages();
}

if (zoomInBtn) {
  zoomInBtn.addEventListener("click", () => {
    updateZoom(zoomLevel + 0.15);
  });
}

if (zoomOutBtn) {
  zoomOutBtn.addEventListener("click", () => {
    updateZoom(zoomLevel - 0.15);
  });
}

// ── Toolbar & Tool Selection ───────────────────────────────────────

if (toolbar) {
  toolbar.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      toolbar.querySelectorAll("[data-tool]").forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        if (b.setAttribute) b.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      activeTool = btn.dataset.tool;

      if (activeTool === "signature") {
        openSignatureModal();
      } else {
        updatePropsBarVisibility();
      }
    });
  });
}

function updatePropsBarVisibility() {
  propTextGroup.forEach((el) => (el.style.display = "none"));
  propColorGroup.forEach((el) => (el.style.display = "none"));
  propShapeGroup.forEach((el) => (el.style.display = "none"));
  propStrokeGroup.forEach((el) => (el.style.display = "none"));
  propOpacityGroup.forEach((el) => (el.style.display = "none"));

  let hasVisibleProps = false;

  if (activeTool === "text") {
    propTextGroup.forEach((el) => (el.style.display = "flex"));
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  } else if (activeTool === "highlight") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propOpacityGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  } else if (activeTool === "draw") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propStrokeGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  } else if (activeTool === "shape") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propShapeGroup.forEach((el) => (el.style.display = "flex"));
    propStrokeGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  } else if (activeTool === "select" && selectedObjId) {
    const obj = editorObjects.find((o) => o.id === selectedObjId);
    if (obj) {
      if (obj.type === "text") {
        propTextGroup.forEach((el) => (el.style.display = "flex"));
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        hasVisibleProps = true;
      } else if (obj.type === "highlight") {
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        propOpacityGroup.forEach((el) => (el.style.display = "flex"));
        hasVisibleProps = true;
      } else if (obj.type === "draw" || obj.type === "shape") {
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        propStrokeGroup.forEach((el) => (el.style.display = "flex"));
        if (obj.type === "shape") {
          propShapeGroup.forEach((el) => (el.style.display = "flex"));
        }
        hasVisibleProps = true;
      }
    }
  }

  if (propsBar) {
    propsBar.style.display = hasVisibleProps ? "flex" : "none";
  }
}

// Property change listeners
[propFontSize, propFontFamily, propColor, propShapeType, propFillColor, propStrokeWidth, propOpacity].forEach((input) => {
  if (input) {
    input.addEventListener("input", applyPropChangesToSelected);
  }
});

if (propBold) {
  propBold.addEventListener("click", () => {
    const isActive = propBold.classList.toggle("active");
    if (propBold.setAttribute) propBold.setAttribute("aria-pressed", isActive ? "true" : "false");
    applyPropChangesToSelected();
  });
}

if (propItalic) {
  propItalic.addEventListener("click", () => {
    const isActive = propItalic.classList.toggle("active");
    if (propItalic.setAttribute) propItalic.setAttribute("aria-pressed", isActive ? "true" : "false");
    applyPropChangesToSelected();
  });
}

if (propTransparentFill) {
  propTransparentFill.addEventListener("click", () => {
    propFillColor.value = "#ffffff";
    propTransparentFill.dataset.none = "true";
    applyPropChangesToSelected();
  });
}

function applyPropChangesToSelected() {
  if (!selectedObjId) return;
  const obj = editorObjects.find((o) => o.id === selectedObjId);
  if (!obj) return;

  saveState();

  if (obj.type === "text") {
    obj.properties.fontSize = parseInt(propFontSize.value, 10) || 18;
    obj.properties.fontFamily = propFontFamily.value;
    obj.properties.color = propColor.value;
    obj.properties.bold = propBold.classList.contains("active");
    obj.properties.italic = propItalic.classList.contains("active");
  } else if (obj.type === "highlight") {
    obj.properties.color = propColor.value;
    obj.properties.opacity = parseFloat(propOpacity.value) || 0.5;
  } else if (obj.type === "draw") {
    obj.properties.color = propColor.value;
    obj.properties.strokeWidth = parseInt(propStrokeWidth.value, 10) || 2;
  } else if (obj.type === "shape") {
    obj.properties.shapeType = propShapeType.value;
    obj.properties.strokeColor = propColor.value;
    obj.properties.fillColor = propTransparentFill.dataset.none === "true" ? "none" : propFillColor.value;
    obj.properties.strokeWidth = parseInt(propStrokeWidth.value, 10) || 2;
  }

  renderAllObjects();
}

// ── Overlay Events & Object Creation ────────────────────────────────

export function updateSelectedObjectUI() {
  document.querySelectorAll(".editor-obj").forEach((node) => {
    if (node.dataset.objId === selectedObjId) {
      node.classList.add("selected");
    } else {
      node.classList.remove("selected");
    }
  });
}

function createObjectForTool(tool, pageNum, x, y) {
  const id = "obj_" + Date.now();
  if (tool === "text") {
    return {
      id,
      type: "text",
      pageNum,
      x,
      y,
      width: 180,
      height: 50,
      rotation: 0,
      properties: {
        text: "Type text here...",
        fontSize: parseInt(propFontSize.value, 10) || 18,
        fontFamily: propFontFamily.value || "sans-serif",
        color: propColor.value || "#000000",
        bold: propBold ? propBold.classList.contains("active") : false,
        italic: propItalic ? propItalic.classList.contains("active") : false,
      },
    };
  }
  if (tool === "highlight") {
    return {
      id,
      type: "highlight",
      pageNum,
      x,
      y,
      width: 160,
      height: 24,
      rotation: 0,
      properties: {
        color: propColor.value || "#ffff00",
        opacity: parseFloat(propOpacity.value) || 0.5,
      },
    };
  }
  if (tool === "shape") {
    return {
      id,
      type: "shape",
      pageNum,
      x,
      y,
      width: 120,
      height: 80,
      rotation: 0,
      properties: {
        shapeType: propShapeType.value || "rect",
        strokeColor: propColor.value || "#000000",
        fillColor: propTransparentFill && propTransparentFill.dataset.none === "true" ? "none" : propFillColor.value || "#ffffff",
        strokeWidth: parseInt(propStrokeWidth.value, 10) || 2,
      },
    };
  }
  if (tool === "note") {
    return {
      id,
      type: "note",
      pageNum,
      x,
      y,
      width: 160,
      height: 120,
      rotation: 0,
      properties: {
        text: "Add note here...",
      },
    };
  }
  return null;
}

function createTempDrawingCanvas(overlay) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = overlay.offsetWidth;
  tempCanvas.height = overlay.offsetHeight;
  tempCanvas.style.position = "absolute";
  tempCanvas.style.top = "0";
  tempCanvas.style.left = "0";
  tempCanvas.style.pointerEvents = "none";
  overlay.appendChild(tempCanvas);
  return tempCanvas;
}

function updateDrawingPath(tempCanvas, currentPath, x, y) {
  currentPath.push({ x, y });

  const ctx = tempCanvas.getContext("2d");
  ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.strokeStyle = propColor.value || "#000000";
  ctx.lineWidth = parseInt(propStrokeWidth.value, 10) || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  currentPath.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
}

function finishDrawingPath(currentPath, pageNum) {
  if (currentPath.length <= 1) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  currentPath.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });

  const w = Math.max(20, maxX - minX);
  const h = Math.max(20, maxY - minY);

  const normalizedPath = currentPath.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
  }));

  return {
    id: "obj_" + Date.now(),
    type: "draw",
    pageNum: pageNum,
    x: minX,
    y: minY,
    width: w,
    height: h,
    rotation: 0,
    properties: {
      path: normalizedPath,
      color: propColor.value || "#000000",
      strokeWidth: parseInt(propStrokeWidth.value, 10) || 2,
      initialWidth: w,
      initialHeight: h,
    },
  };
}

function setupOverlayEvents(overlay, pageNum) {
  let isDrawing = false;
  let currentPath = [];
  let tempCanvas = null;

  overlay.addEventListener("mousedown", (e) => {
    if (e.target !== overlay) return;

    const rect = overlay.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (activeTool === "select") {
      selectedObjId = null;
      updateSelectedObjectUI();
      updatePropsBarVisibility();
      return;
    }

    saveState();

    const newObj = createObjectForTool(activeTool, pageNum, clickX, clickY);
    if (newObj) {
      editorObjects.push(newObj);
      selectedObjId = newObj.id;
      renderAllObjects();
    } else if (activeTool === "image") {
      triggerImageUploadForPage(pageNum, clickX, clickY);
    } else if (activeTool === "draw") {
      isDrawing = true;
      currentPath = [{ x: clickX, y: clickY }];
      tempCanvas = createTempDrawingCanvas(overlay);
    }
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!isDrawing || !tempCanvas) return;

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateDrawingPath(tempCanvas, currentPath, x, y);
  });

  const finishDrawing = () => {
    if (!isDrawing) return;
    isDrawing = false;

    if (tempCanvas) {
      tempCanvas.remove();
      tempCanvas = null;
    }

    const drawObj = finishDrawingPath(currentPath, pageNum);
    if (drawObj) {
      editorObjects.push(drawObj);
      selectedObjId = drawObj.id;
      renderAllObjects();
    }
  };

  overlay.addEventListener("mouseup", finishDrawing);
  overlay.addEventListener("mouseleave", finishDrawing);
}

function triggerImageUploadForPage(pageNum, clickX, clickY) {
  const fileInputTemp = document.createElement("input");
  fileInputTemp.type = "file";
  fileInputTemp.accept = "image/png, image/jpeg, image/webp";

  fileInputTemp.onchange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
      const src = await fileToDataUrl(file);
      const img = new Image();
      img.onload = () => {
        saveState();
        let w = img.naturalWidth || 150;
        let h = img.naturalHeight || 150;
        const maxW = 200;
        if (w > maxW) {
          const ratio = maxW / w;
          w = maxW;
          h = h * ratio;
        }

        const newObj = {
          id: "obj_" + Date.now(),
          type: "image",
          pageNum: pageNum,
          x: clickX,
          y: clickY,
          width: w,
          height: h,
          rotation: 0,
          properties: { src },
        };
        editorObjects.push(newObj);
        selectedObjId = newObj.id;
        renderAllObjects();
      };
      img.src = src;
    } catch (err) {
      showToast("Error loading image.", "error");
    }
  };

  fileInputTemp.click();
}

// ── Canvas Helper Drawing Functions ───────────────────────────────

function drawCanvasPath(canvas, properties) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = properties.color || "#000000";
  ctx.lineWidth = properties.strokeWidth || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const initW = properties.initialWidth || canvas.width;
  const initH = properties.initialHeight || canvas.height;
  const scaleX = initW > 0 ? canvas.width / initW : 1;
  const scaleY = initH > 0 ? canvas.height / initH : 1;

  ctx.save();
  ctx.scale(scaleX, scaleY);

  ctx.beginPath();
  (properties.path || []).forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawCanvasShape(canvas, width, height, properties) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = properties.strokeColor || "#000000";
  ctx.lineWidth = properties.strokeWidth || 2;

  if (properties.fillColor && properties.fillColor !== "none") {
    ctx.fillStyle = properties.fillColor;
  }

  const st = properties.shapeType;
  if (st === "rect") {
    if (properties.fillColor && properties.fillColor !== "none") {
      ctx.fillRect(0, 0, width, height);
    }
    ctx.strokeRect(0, 0, width, height);
  } else if (st === "circle") {
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, Math.max(1, width / 2 - 2), Math.max(1, height / 2 - 2), 0, 0, 2 * Math.PI);
    if (properties.fillColor && properties.fillColor !== "none") ctx.fill();
    ctx.stroke();
  } else if (st === "line" || st === "arrow") {
    ctx.beginPath();
    ctx.moveTo(4, height / 2);
    ctx.lineTo(width - 4, height / 2);
    ctx.stroke();

    if (st === "arrow") {
      ctx.beginPath();
      ctx.moveTo(width - 12, height / 2 - 6);
      ctx.lineTo(width - 2, height / 2);
      ctx.lineTo(width - 12, height / 2 + 6);
      ctx.stroke();
    }
  }
}

function updateObjectInternalDimensions(el, obj) {
  if (obj.type === "draw") {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      canvas.width = obj.width;
      canvas.height = obj.height;
      drawCanvasPath(canvas, obj.properties);
    }
  } else if (obj.type === "shape") {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      canvas.width = obj.width;
      canvas.height = obj.height;
      drawCanvasShape(canvas, obj.width, obj.height, obj.properties);
    }
  }
}

// ── Render Objects on DOM Overlay ───────────────────────────────────

function renderObjectContent(obj, el) {
  if (obj.type === "text") {
    const textarea = document.createElement("textarea");
    textarea.className = "editor-text-input";
    textarea.value = obj.properties.text;
    textarea.style.fontSize = `${obj.properties.fontSize}px`;
    textarea.style.fontFamily = obj.properties.fontFamily;
    textarea.style.color = obj.properties.color;
    textarea.style.fontWeight = obj.properties.bold ? "bold" : "normal";
    textarea.style.fontStyle = obj.properties.italic ? "italic" : "normal";

    textarea.addEventListener("input", (e) => {
      obj.properties.text = e.target.value;
    });

    el.appendChild(textarea);
  } else if (obj.type === "highlight") {
    el.style.background = obj.properties.color;
    el.style.opacity = obj.properties.opacity;
    el.style.borderRadius = "3px";
  } else if (obj.type === "draw") {
    const canvas = document.createElement("canvas");
    canvas.width = obj.width;
    canvas.height = obj.height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    if (!obj.properties.initialWidth) obj.properties.initialWidth = obj.width;
    if (!obj.properties.initialHeight) obj.properties.initialHeight = obj.height;

    drawCanvasPath(canvas, obj.properties);
    el.appendChild(canvas);
  } else if (obj.type === "shape") {
    const canvas = document.createElement("canvas");
    canvas.width = obj.width;
    canvas.height = obj.height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    drawCanvasShape(canvas, obj.width, obj.height, obj.properties);
    el.appendChild(canvas);
  } else if (obj.type === "image" || obj.type === "signature") {
    const img = document.createElement("img");
    img.src = obj.properties.src;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.pointerEvents = "none";
    el.appendChild(img);
  } else if (obj.type === "note") {
    const noteBox = document.createElement("div");
    noteBox.className = "editor-sticky-note";

    const noteText = document.createElement("textarea");
    noteText.value = obj.properties.text;
    noteText.addEventListener("input", (e) => {
      obj.properties.text = e.target.value;
    });

    noteBox.appendChild(noteText);
    el.appendChild(noteBox);
  }
}

function createObjectHandles(objId) {
  const moveHandle = document.createElement("div");
  moveHandle.className = "editor-obj-handle move";
  moveHandle.textContent = "✥";
  moveHandle.title = "Drag to move";

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "editor-obj-handle se";

  const deleteHandle = document.createElement("div");
  deleteHandle.className = "editor-obj-handle delete";
  deleteHandle.textContent = "✕";
  deleteHandle.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteObject(objId);
  });

  return { moveHandle, resizeHandle, deleteHandle };
}

function renderSingleObject(obj, overlay) {
  const el = document.createElement("div");
  el.className = `editor-obj ${obj.id === selectedObjId ? "selected" : ""}`;
  el.dataset.objId = obj.id;
  el.style.left = `${obj.x}px`;
  el.style.top = `${obj.y}px`;
  el.style.width = `${obj.width}px`;
  el.style.height = `${obj.height}px`;

  renderObjectContent(obj, el);

  const { moveHandle, resizeHandle, deleteHandle } = createObjectHandles(obj.id);

  el.appendChild(moveHandle);
  el.appendChild(resizeHandle);
  el.appendChild(deleteHandle);

  overlay.appendChild(el);

  el.addEventListener("mousedown", (e) => {
    if (e.target === deleteHandle || e.target === resizeHandle) return;
    if (selectedObjId !== obj.id) {
      selectedObjId = obj.id;
      updateSelectedObjectUI();
      updatePropsBarVisibility();
    }
  });

  makeObjectDraggableAndResizable(el, obj, resizeHandle, deleteHandle, moveHandle);
}

export function renderAllObjects() {
  const overlays = document.querySelectorAll(".pdf-page-overlay");
  const overlayMap = new Map();
  overlays.forEach((overlay) => {
    overlay.innerHTML = "";
    overlayMap.set(parseInt(overlay.dataset.pageNum, 10), overlay);
  });

  editorObjects.forEach((obj) => {
    const overlay = overlayMap.get(obj.pageNum);
    if (!overlay) return;
    renderSingleObject(obj, overlay);
  });
}

function makeObjectDraggableAndResizable(el, obj, resizeHandle, deleteHandle, moveHandle) {
  let isDragging = false;
  let isResizing = false;
  let startX, startY;
  let startLeft, startTop;
  let startWidth, startHeight;

  const overlay = el.parentElement;

  const startDrag = (e) => {
    if (e.target === deleteHandle || e.target === resizeHandle) return;
    if (e.target.tagName === "TEXTAREA" && e.target !== moveHandle) {
      return;
    }

    isDragging = true;
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startLeft = obj.x;
    startTop = obj.y;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  if (moveHandle) {
    moveHandle.addEventListener("mousedown", startDrag);
    moveHandle.addEventListener("touchstart", startDrag, { passive: false });
  }

  el.addEventListener("mousedown", startDrag);
  el.addEventListener("touchstart", startDrag, { passive: false });

  const onMove = (e) => {
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (isDragging) {
      const maxLeft = overlay ? Math.max(0, overlay.clientWidth - obj.width) : 2000;
      const maxTop = overlay ? Math.max(0, overlay.clientHeight - obj.height) : 2000;

      obj.x = Math.max(0, Math.min(maxLeft, startLeft + dx));
      obj.y = Math.max(0, Math.min(maxTop, startTop + dy));

      el.style.left = `${obj.x}px`;
      el.style.top = `${obj.y}px`;

      if (e.type && e.type.includes("touch")) e.preventDefault();
    } else if (isResizing) {
      obj.width = Math.max(20, startWidth + dx);
      obj.height = Math.max(20, startHeight + dy);

      el.style.width = `${obj.width}px`;
      el.style.height = `${obj.height}px`;

      updateObjectInternalDimensions(el, obj);

      if (e.type && e.type.includes("touch")) e.preventDefault();
    }
  };

  const onEnd = () => {
    if (isDragging || isResizing) {
      saveState();
    }
    isDragging = false;
    isResizing = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchend", onEnd);
  };

  const startResize = (e) => {
    e.stopPropagation();
    isResizing = true;
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startWidth = obj.width;
    startHeight = obj.height;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  resizeHandle.addEventListener("mousedown", startResize);
  resizeHandle.addEventListener("touchstart", startResize, { passive: false });
}

// ── Signature Modal Integration ─────────────────────────────────────

function initSignaturePadInModal() {
  if (signaturePad) return;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  sigPadCanvas.width = sigPadCanvas.offsetWidth * ratio;
  sigPadCanvas.height = sigPadCanvas.offsetHeight * ratio;
  sigPadCanvas.getContext("2d").scale(ratio, ratio);

  signaturePad = new window.SignaturePad(sigPadCanvas, {
    minWidth: 1,
    maxWidth: 3,
    penColor: currentSigColor,
  });
}

function openSignatureModal() {
  if (sigModal) {
    sigModal.style.display = "flex";
    initSignaturePadInModal();
  }
}

function closeSignatureModal() {
  if (sigModal) sigModal.style.display = "none";
}

if (sigCancelBtn) sigCancelBtn.addEventListener("click", closeSignatureModal);

sigModePills.forEach((pill) => {
  pill.addEventListener("click", () => {
    activatePill(document.getElementById("sig-mode-pills"), pill.dataset.value);
    currentSigMode = pill.dataset.value;

    document.getElementById("sig-draw-box").style.display = currentSigMode === "draw" ? "flex" : "none";
    document.getElementById("sig-type-box").style.display = currentSigMode === "type" ? "flex" : "none";
    document.getElementById("sig-upload-box").style.display = currentSigMode === "upload" ? "flex" : "none";
  });
});

sigColorPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    activatePill(document.getElementById("sig-color-pills"), pill.dataset.value);
    currentSigColor = pill.dataset.value;

    if (signaturePad) signaturePad.penColor = currentSigColor;
    if (sigTypePreview) sigTypePreview.style.color = currentSigColor;
  });
});

if (sigClearBtn) {
  sigClearBtn.addEventListener("click", () => {
    if (signaturePad) signaturePad.clear();
  });
}

if (sigFileInput) {
  sigFileInput.addEventListener("change", async (e) => {
    if (e.target.files.length) {
      uploadedSigSrc = await fileToDataUrl(e.target.files[0]);
      sigUploadPreview.src = uploadedSigSrc;
      sigUploadPreview.style.display = "block";
    }
  });
}

if (sigTypeInput) {
  sigTypeInput.addEventListener("input", () => {
    sigTypePreview.textContent = sigTypeInput.value || "Your Signature";
  });
}

function getTypedSignatureAsBase64() {
  const text = sigTypeInput.value || "Your Signature";
  const ctx = sigTypeCanvas.getContext("2d");
  ctx.font = '48px "Dancing Script"';
  const metrics = ctx.measureText(text);

  const width = Math.ceil(metrics.width) + 20;
  const height = 80;

  sigTypeCanvas.width = width;
  sigTypeCanvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '48px "Dancing Script"';
  ctx.fillStyle = currentSigColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);

  return sigTypeCanvas.toDataURL("image/png");
}

if (sigPlaceBtn) {
  sigPlaceBtn.addEventListener("click", () => {
    let imgSrc = null;

    if (currentSigMode === "draw") {
      if (signaturePad && !signaturePad.isEmpty()) {
        imgSrc = signaturePad.toDataURL("image/png");
      } else {
        showToast("Please draw a signature first.", "error");
        return;
      }
    } else if (currentSigMode === "type") {
      imgSrc = getTypedSignatureAsBase64();
    } else if (currentSigMode === "upload") {
      if (uploadedSigSrc) {
        imgSrc = uploadedSigSrc;
      } else {
        showToast("Please select a signature image first.", "error");
        return;
      }
    }

    if (imgSrc) {
      saveState();
      const newObj = {
        id: "obj_" + Date.now(),
        type: "signature",
        pageNum: 1,
        x: 100,
        y: 100,
        width: 180,
        height: 80,
        rotation: 0,
        properties: { src: imgSrc },
      };
      editorObjects.push(newObj);
      selectedObjId = newObj.id;
      renderAllObjects();
      closeSignatureModal();
    }
  });
}

// ── PDF Export Process Helpers ─────────────────────────────────────

function renderDrawObject(ctx, obj) {
  ctx.strokeStyle = obj.properties.color || "#000000";
  ctx.lineWidth = obj.properties.strokeWidth || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  (obj.properties.path || []).forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
}

function renderShapeObject(ctx, obj) {
  ctx.strokeStyle = obj.properties.strokeColor || "#000000";
  ctx.lineWidth = obj.properties.strokeWidth || 2;

  if (obj.properties.fillColor && obj.properties.fillColor !== "none") {
    ctx.fillStyle = obj.properties.fillColor;
  }

  const st = obj.properties.shapeType;
  if (st === "rect") {
    if (obj.properties.fillColor && obj.properties.fillColor !== "none") ctx.fillRect(0, 0, obj.width, obj.height);
    ctx.strokeRect(0, 0, obj.width, obj.height);
  } else if (st === "circle") {
    ctx.beginPath();
    ctx.ellipse(obj.width / 2, obj.height / 2, obj.width / 2 - 2, obj.height / 2 - 2, 0, 0, 2 * Math.PI);
    if (obj.properties.fillColor && obj.properties.fillColor !== "none") ctx.fill();
    ctx.stroke();
  } else if (st === "line" || st === "arrow") {
    ctx.beginPath();
    ctx.moveTo(4, obj.height / 2);
    ctx.lineTo(obj.width - 4, obj.height / 2);
    ctx.stroke();

    if (st === "arrow") {
      ctx.beginPath();
      ctx.moveTo(obj.width - 12, obj.height / 2 - 6);
      ctx.lineTo(obj.width - 2, obj.height / 2);
      ctx.lineTo(obj.width - 12, obj.height / 2 + 6);
      ctx.stroke();
    }
  }
}

function renderNoteObject(ctx, obj) {
  ctx.fillStyle = "#fef08a";
  ctx.fillRect(0, 0, obj.width, obj.height);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, obj.width, obj.height);

  ctx.fillStyle = "#000000";
  ctx.font = "12px sans-serif";
  const lines = (obj.properties.text || "").split("\n");
  lines.forEach((line, lIdx) => {
    ctx.fillText(line, 6, 16 + lIdx * 16);
  });
}

export function renderObjectToCanvasDataUrl(obj) {
  const tempCanvas = document.createElement("canvas");
  const scale = 2; // high-DPI crisp export
  tempCanvas.width = obj.width * scale;
  tempCanvas.height = obj.height * scale;

  const ctx = tempCanvas.getContext("2d");
  ctx.scale(scale, scale);

  if (obj.type === "draw") {
    renderDrawObject(ctx, obj);
  } else if (obj.type === "shape") {
    renderShapeObject(ctx, obj);
  } else if (obj.type === "note") {
    renderNoteObject(ctx, obj);
  }

  const dataUrl = tempCanvas.toDataURL("image/png");
  tempCanvas.width = 0;
  tempCanvas.height = 0;
  return dataUrl;
}

export function applyTextObject(page, obj, pdfCoords, pageMetrics, fonts) {
  const text = obj.properties.text || "";
  const size = (obj.properties.fontSize || 18) * (pageMetrics.pdfWidth / pageMetrics.pageViewport.width);
  const color = hexToPdfRgb(obj.properties.color || "#000000");

  let font = fonts.fontHelvetica;
  if (obj.properties.bold) font = fonts.fontHelveticaBold;
  else if (obj.properties.italic) font = fonts.fontHelveticaOblique;

  const lines = text.split("\n");
  lines.forEach((line, lIdx) => {
    page.drawText(line, {
      x: pdfCoords.x,
      y: pdfCoords.y + pdfCoords.height - size * 1.1 * (lIdx + 1),
      size: size,
      font: font,
      color: color,
    });
  });
}

export function applyHighlightObject(page, obj, pdfCoords) {
  const color = hexToPdfRgb(obj.properties.color || "#ffff00");
  page.drawRectangle({
    x: pdfCoords.x,
    y: pdfCoords.y,
    width: pdfCoords.width,
    height: pdfCoords.height,
    color: color,
    opacity: obj.properties.opacity || 0.5,
  });
}

export async function applyImageObject(page, obj, pdfCoords, pdfDoc, embeddedImages) {
  const src = obj.properties.src;
  if (!src) return;

  let pdfImage;
  if (embeddedImages.has(src)) {
    pdfImage = embeddedImages.get(src);
  } else {
    if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) {
      pdfImage = await pdfDoc.embedJpg(src);
    } else {
      pdfImage = await pdfDoc.embedPng(src);
    }
    embeddedImages.set(src, pdfImage);
  }

  page.drawImage(pdfImage, {
    x: pdfCoords.x,
    y: pdfCoords.y,
    width: pdfCoords.width,
    height: pdfCoords.height,
  });
}

export async function applyCanvasObject(page, obj, pdfCoords, pdfDoc) {
  const dataUrl = renderObjectToCanvasDataUrl(obj);
  const pdfImage = await pdfDoc.embedPng(dataUrl);
  page.drawImage(pdfImage, {
    x: pdfCoords.x,
    y: pdfCoords.y,
    width: pdfCoords.width,
    height: pdfCoords.height,
  });
}

export async function applyEditorObjectToPage(page, obj, pageMetrics, fonts, pdfDoc, embeddedImages) {
  const pdfCoords = domToPdfCoords(
    { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
    pageMetrics.pageViewport,
    { width: pageMetrics.pdfWidth, height: pageMetrics.pdfHeight }
  );

  if (obj.type === "text") {
    applyTextObject(page, obj, pdfCoords, pageMetrics, fonts);
  } else if (obj.type === "highlight") {
    applyHighlightObject(page, obj, pdfCoords);
  } else if (obj.type === "image" || obj.type === "signature") {
    await applyImageObject(page, obj, pdfCoords, pdfDoc, embeddedImages);
  } else if (obj.type === "draw" || obj.type === "shape" || obj.type === "note") {
    await applyCanvasObject(page, obj, pdfCoords, pdfDoc);
  }
}

export function sanitizeFilename(filename) {
  let name = (filename || "document.pdf").trim().replace(/[\/\\]/g, "_");
  if (!name) name = "document.pdf";
  if (!name.toLowerCase().endsWith(".pdf")) {
    name += ".pdf";
  }
  return name;
}

export async function generateEditedPdfBlob() {
  if (!window.PDFLib) {
    showToast("PDF library not ready yet. Please wait a moment.", "error");
    return null;
  }

  workspaceContainer.style.display = "none";
  if (progressArea) progressArea.style.display = "block";
  setProgress(progressBar, progressLabel, 10, "Loading PDF document...");

  // Delay slightly to yield main thread and paint progress DOM
  await new Promise((r) => setTimeout(r, 50));

  try {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(pdfBytesOriginal, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    setProgress(progressBar, progressLabel, 30, "Embedding fonts & images...");
    const [fontHelvetica, fontHelveticaBold, fontHelveticaOblique] = await Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
      pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    ]);

    const fonts = { fontHelvetica, fontHelveticaBold, fontHelveticaOblique };
    const embeddedImages = new Map();

    setProgress(progressBar, progressLabel, 50, "Applying annotations & edits...");

    for (let i = 0; i < editorObjects.length; i++) {
      const obj = editorObjects[i];
      if (obj.pageNum < 1 || obj.pageNum > pages.length) continue;

      const page = pages[obj.pageNum - 1];
      const pageMetrics = pageMetricsCache.get(obj.pageNum);

      if (!pageMetrics) continue;

      await applyEditorObjectToPage(page, obj, pageMetrics, fonts, pdfDoc, embeddedImages);

      setProgress(
        progressBar,
        progressLabel,
        50 + Math.floor(((i + 1) / editorObjects.length) * 35),
        `Applying edit ${i + 1}/${editorObjects.length}...`
      );
    }

    setProgress(progressBar, progressLabel, 90, "Saving edited PDF...");
    const modifiedPdfBytes = await pdfDoc.save();

    setProgress(progressBar, progressLabel, 100, "Done!");
    return new Blob([modifiedPdfBytes], { type: "application/pdf" });
  } catch (err) {
    showToast("We couldn't create the edited PDF. Your original file has not been changed.", "error");
    if (progressArea) progressArea.style.display = "none";
    if (workspaceContainer) workspaceContainer.style.display = "flex";
    return null;
  }
}

export async function exportEditedPdf() {
  const blob = await generateEditedPdfBlob();
  if (!blob) return;

  const userFileName = filenameInput ? filenameInput.value : fileName;
  const safeName = sanitizeFilename(userFileName);

  setTimeout(() => {
    if (progressArea) progressArea.style.display = "none";
    if (resultsArea) resultsArea.classList.add("is-visible");

    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
    }
    currentDownloadUrl = URL.createObjectURL(blob);

    if (downloadFinalBtn) {
      downloadFinalBtn.onclick = () => {
        triggerDownload(currentDownloadUrl, safeName, true);
        currentDownloadUrl = null;
      };
    }
  }, 400);
}

if (exportBtn) exportBtn.addEventListener("click", exportEditedPdf);

export function checkShareSupport() {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    try {
      const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
      if (navigator.canShare({ files: [testFile] })) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export async function shareEditedPdf() {
  const blob = await generateEditedPdfBlob();
  if (!blob) return;

  const userFileName = filenameInput ? filenameInput.value : fileName;
  const safeName = sanitizeFilename(userFileName);

  if (progressArea) progressArea.style.display = "none";
  if (workspaceContainer) workspaceContainer.style.display = "flex";

  try {
    const file = new File([blob], safeName, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: safeName,
      });
    } else {
      showToast("Sharing is not supported on this browser.", "error");
    }
  } catch (err) {
    if (err && err.name !== "AbortError") {
      showToast("Could not share file.", "error");
    }
  }
}

if (shareBtn) {
  if (!checkShareSupport()) {
    shareBtn.style.display = "none";
  } else {
    shareBtn.addEventListener("click", shareEditedPdf);
  }
}

// ── State Management & UI Wiring ────────────────────────────────────

function updateUndoRedoUI() {
  if (undoBtn) undoBtn.disabled = historyStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

export function saveState() {
  historyStack.push(JSON.stringify(editorObjects));
  redoStack = [];
  updateUndoRedoUI();
}

if (undoBtn) undoBtn.addEventListener("click", undoAction);
if (redoBtn) redoBtn.addEventListener("click", redoAction);

export function undoAction() {
  if (historyStack.length === 0) return;
  redoStack.push(JSON.stringify(editorObjects));
  const previousState = historyStack.pop();
  editorObjects = JSON.parse(previousState);
  updateUndoRedoUI();
  renderAllObjects();
}

export function redoAction() {
  if (redoStack.length === 0) return;
  historyStack.push(JSON.stringify(editorObjects));
  const nextState = redoStack.pop();
  editorObjects = JSON.parse(nextState);
  updateUndoRedoUI();
  renderAllObjects();
}

window.addEventListener("keydown", (e) => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  ) {
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    if (e.shiftKey) redoAction();
    else undoAction();
    e.preventDefault();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    redoAction();
    e.preventDefault();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedObjId) {
      deleteObject(selectedObjId);
      e.preventDefault();
    }
  }
});

function deleteObject(objId) {
  saveState();
  editorObjects = editorObjects.filter((o) => o.id !== objId);
  selectedObjId = null;
  renderAllObjects();
  updatePropsBarVisibility();
}

if (deleteObjBtn) {
  deleteObjBtn.addEventListener("click", () => {
    if (selectedObjId) deleteObject(selectedObjId);
  });
}

export function resetEditor() {
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }

  if (pdfjsDocument && typeof pdfjsDocument.destroy === "function") {
    try {
      pdfjsDocument.destroy();
    } catch (_) {}
  }
  pdfjsDocument = null;
  pdfBytesOriginal = null;
  numPages = 0;
  currentPageIndex = 1;
  editorObjects = [];
  historyStack = [];
  redoStack = [];
  selectedObjId = null;
  activeTool = "select";
  if (toolbar) {
    toolbar.querySelectorAll("[data-tool]").forEach((b) => {
      const isSelect = b.dataset.tool === "select";
      b.classList.toggle("active", isSelect);
      if (b.setAttribute) b.setAttribute("aria-pressed", isSelect ? "true" : "false");
    });
  }
  if (filenameInput) {
    filenameInput.value = "document.pdf";
  }
  if (propBold) {
    propBold.classList.remove("active");
    if (propBold.setAttribute) propBold.setAttribute("aria-pressed", "false");
  }
  if (propItalic) {
    propItalic.classList.remove("active");
    if (propItalic.setAttribute) propItalic.setAttribute("aria-pressed", "false");
  }
  zoomLevel = 1.0;
  if (zoomValLabel) zoomValLabel.textContent = "100%";

  if (editorHeader) editorHeader.style.display = "block";
  if (dropZone) dropZone.style.display = "flex";
  if (workspaceContainer) workspaceContainer.style.display = "none";
  if (progressArea) progressArea.style.display = "none";
  if (resultsArea) resultsArea.classList.remove("is-visible");
  if (fileInput) fileInput.value = "";
}

if (resetBtn) resetBtn.addEventListener("click", resetEditor);
