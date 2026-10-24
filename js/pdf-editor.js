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
let selectedObjIds = new Set();

export function getSelectedObjIds() {
  return Array.from(selectedObjIds);
}

export function setSelectedObjId(id) {
  selectedObjIds.clear();
  if (id) {
    selectedObjIds.add(id);
    selectedObjId = id;
  } else {
    selectedObjId = null;
  }
}

export function selectObject(id, multi = false) {
  if (!multi) {
    selectedObjIds.clear();
  }
  if (id) {
    if (multi && selectedObjIds.has(id)) {
      selectedObjIds.delete(id);
    } else {
      selectedObjIds.add(id);
    }
  }
  selectedObjId = selectedObjIds.size > 0 ? Array.from(selectedObjIds)[selectedObjIds.size - 1] : null;
  updateSelectedObjectUI();
  updatePropsBarVisibility();
}

export function deselectAllObjects() {
  selectedObjIds.clear();
  selectedObjId = null;
  updateSelectedObjectUI();
  updatePropsBarVisibility();
}

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

// Page Rotations: pageNum -> relative rotation angle in degrees (0, 90, 180, 270)
export const pageRotations = new Map();

// Deleted Pages: Set of pageNums that have been deleted
export const deletedPages = new Set();

// Page Order: array of page numbers in current order
export let pageOrder = [];

// Dragged Card Index for Sidebar Drag & Drop Reordering
let draggedCardIndex = null;

// Pinch-to-Zoom Gesture State
let initialPinchDistance = null;
let initialPinchZoom = 1.0;

// Page metrics cache: pageNum -> { pageViewport, pdfWidth, pdfHeight, userRotation }
const pageMetricsCache = new Map();

// Overlay map cache: pageNum -> overlay DOM element
const pageOverlayMap = new Map();

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
const toggleSidebarBtn = document.getElementById("editor-toggle-sidebar-btn");
const sidebarEl = document.getElementById("editor-sidebar");
const sidebarCloseBtn = document.getElementById("editor-sidebar-close");
const sidebarThumbsContainer = document.getElementById("editor-sidebar-thumbs");
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
const propTextAlign = document.getElementById("prop-text-align");
const propBold = document.getElementById("prop-bold");
const propItalic = document.getElementById("prop-italic");
const propTextBgColor = document.getElementById("prop-text-bg-color");
const propTextBgTransparent = document.getElementById("prop-text-bg-transparent");
const propTextPadding = document.getElementById("prop-text-padding");
const propColor = document.getElementById("prop-color");
const propShapeType = document.getElementById("prop-shape-type");
const propFillColor = document.getElementById("prop-fill-color");
const propTransparentFill = document.getElementById("prop-transparent-fill");
const propStrokeWidth = document.getElementById("prop-stroke-width");
const propStrokeStyle = document.getElementById("prop-stroke-style");
const propOpacity = document.getElementById("prop-opacity");

const propTextGroup = document.querySelectorAll(".prop-group-text");
const propColorGroup = document.querySelectorAll(".prop-group-color");
const propShapeGroup = document.querySelectorAll(".prop-group-shape");
const propStrokeGroup = document.querySelectorAll(".prop-group-stroke");
const propOpacityGroup = document.querySelectorAll(".prop-group-opacity");
const propLayerGroup = document.querySelectorAll(".prop-group-layer");
const propMultiSelectGroup = document.querySelectorAll(".prop-group-multiselect");
const propMultiCount = document.getElementById("prop-multi-count");

const propLayerFront = document.getElementById("prop-layer-front");
const propLayerForward = document.getElementById("prop-layer-forward");
const propLayerBackward = document.getElementById("prop-layer-backward");
const propLayerBack = document.getElementById("prop-layer-back");

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

export function domToPdfCoords(domRect, pageViewport, pdfSize, userRotation = 0) {
  const rot = ((userRotation % 360) + 360) % 360;
  const vw = pageViewport.width;
  const vh = pageViewport.height;
  const pw = pdfSize.width;
  const ph = pdfSize.height;

  const { x, y, width: w, height: h } = domRect;

  if (rot === 90) {
    const pdfX = (y / vh) * pw;
    const pdfY = ph - ((x + w) / vw) * ph;
    const pdfW = (h / vh) * pw;
    const pdfH = (w / vw) * ph;
    return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
  } else if (rot === 180) {
    const pdfX = pw - ((x + w) / vw) * pw;
    const pdfY = (y / vh) * ph;
    const pdfW = (w / vw) * pw;
    const pdfH = (h / vh) * ph;
    return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
  } else if (rot === 270) {
    const pdfX = pw - ((y + h) / vh) * pw;
    const pdfY = (x / vw) * ph;
    const pdfW = (h / vh) * pw;
    const pdfH = (w / vw) * ph;
    return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
  } else {
    const pdfX = (x / vw) * pw;
    const pdfY = ph - ((y + h) / vh) * ph;
    const pdfW = (w / vw) * pw;
    const pdfH = (h / vh) * ph;
    return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
  }
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
    } catch (err) {
      console.warn("Error destroying PDF document:", err);
    }
    pdfjsDocument = null;
  }

  const pdfjsBuffer = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: pdfjsBuffer });
  pdfjsDocument = await loadingTask.promise;

  numPages = pdfjsDocument.numPages;
  currentPageIndex = 1;
  pageRotations.clear();
  deletedPages.clear();
  pageOrder = Array.from({ length: numPages }, (_, i) => i + 1);

  editorObjects = [];
  historyStack = [];
  redoStack = [];
  updateUndoRedoUI();

  await renderAllPages();
}

// ── Page Management Actions ───────────────────────────────────────

// ── Object Z-Order & Layer Management ─────────────────────────────

export function getEditorObjects() {
  return editorObjects;
}

export function moveObjectZOrder(objId, action) {
  const targetObj = editorObjects.find((o) => o.id === objId);
  if (!targetObj) return false;

  const samePageObjects = editorObjects.filter((o) => o.pageNum === targetObj.pageNum);
  if (samePageObjects.length <= 1) return false;

  const currentIdxOnPage = samePageObjects.indexOf(targetObj);
  let newIdxOnPage = currentIdxOnPage;

  if (action === "front") {
    newIdxOnPage = samePageObjects.length - 1;
  } else if (action === "back") {
    newIdxOnPage = 0;
  } else if (action === "forward") {
    newIdxOnPage = Math.min(samePageObjects.length - 1, currentIdxOnPage + 1);
  } else if (action === "backward") {
    newIdxOnPage = Math.max(0, currentIdxOnPage - 1);
  }

  if (newIdxOnPage === currentIdxOnPage) return false;

  saveState();

  const reorderedSamePage = [...samePageObjects];
  reorderedSamePage.splice(currentIdxOnPage, 1);
  reorderedSamePage.splice(newIdxOnPage, 0, targetObj);

  const updatedObjects = [];
  let samePagePointer = 0;

  for (let i = 0; i < editorObjects.length; i++) {
    if (editorObjects[i].pageNum === targetObj.pageNum) {
      updatedObjects.push(reorderedSamePage[samePagePointer++]);
    } else {
      updatedObjects.push(editorObjects[i]);
    }
  }

  editorObjects = updatedObjects;
  renderAllObjects();
  return true;
}

export function getActivePages() {
  const active = [];
  if (pageOrder.length > 0) {
    for (const pageNum of pageOrder) {
      if (!deletedPages.has(pageNum)) {
        active.push(pageNum);
      }
    }
  } else {
    for (let i = 1; i <= numPages; i++) {
      if (!deletedPages.has(i)) {
        active.push(i);
      }
    }
  }
  return active;
}

export function reorderPage(fromActiveIndex, toActiveIndex) {
  const activePages = getActivePages();
  if (
    fromActiveIndex < 0 ||
    fromActiveIndex >= activePages.length ||
    toActiveIndex < 0 ||
    toActiveIndex >= activePages.length ||
    fromActiveIndex === toActiveIndex
  ) {
    return false;
  }

  saveState();

  const movedPageNum = activePages[fromActiveIndex];
  const targetPageNum = activePages[toActiveIndex];

  const fullFromIdx = pageOrder.indexOf(movedPageNum);
  const fullToIdx = pageOrder.indexOf(targetPageNum);

  if (fullFromIdx !== -1 && fullToIdx !== -1) {
    pageOrder.splice(fullFromIdx, 1);
    pageOrder.splice(fullToIdx, 0, movedPageNum);
  }

  renderAllPages();
  return true;
}

export function rotatePage(pageNum, deltaDegrees = 90) {
  saveState();
  const currentRot = pageRotations.get(pageNum) || 0;
  const newRot = (currentRot + deltaDegrees) % 360;
  pageRotations.set(pageNum, newRot);
  renderAllPages();
}

export function deletePage(pageNum) {
  const activeCount = numPages - deletedPages.size;
  if (activeCount <= 1) {
    showToast("Cannot delete page. A document must contain at least one page.", "error");
    return false;
  }
  saveState();
  deletedPages.add(pageNum);

  editorObjects = editorObjects.filter((obj) => obj.pageNum !== pageNum);
  if (selectedObjId && !editorObjects.some((o) => o.id === selectedObjId)) {
    selectedObjId = null;
  }

  const active = getActivePages();
  if (!active.includes(currentPageIndex)) {
    currentPageIndex = active[0] || 1;
  }

  renderAllPages();
  return true;
}

export async function renderAllPages() {
  if (!pdfjsDocument) return;

  const pagezoomPill = document.getElementById("editor-pagezoom-pill");

  pagesScrollArea.innerHTML = "";
  pageMetricsCache.clear();
  pageOverlayMap.clear();

  const activePages = getActivePages();
  if (activePages.length === 0) return;

  if (!activePages.includes(currentPageIndex)) {
    currentPageIndex = activePages[0];
  }

  const activeIdx = activePages.indexOf(currentPageIndex);
  const displayIdx = activeIdx !== -1 ? activeIdx + 1 : 1;

  if (pageIndicator) {
    pageIndicator.textContent = `${displayIdx} / ${activePages.length}`;
  }

  if (prevPageBtn) {
    prevPageBtn.disabled = activeIdx <= 0;
  }
  if (nextPageBtn) {
    nextPageBtn.disabled = activeIdx >= activePages.length - 1;
  }

  const pageNum = currentPageIndex;
  const page = await pdfjsDocument.getPage(pageNum);

  const scrollAreaW = pagesScrollArea.clientWidth;
  const availableW = scrollAreaW > 48 ? scrollAreaW - 48 : 800;
  const maxContainerW = Math.min(availableW, 900);
  const dpr = window.devicePixelRatio || 1;

  const userRot = pageRotations.get(pageNum) || 0;
  const totalRotation = (page.rotate + userRot) % 360;

  const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });

  const baseScale = maxContainerW / unscaledViewport.width;
  const finalScale = baseScale * zoomLevel;

  const viewport = page.getViewport({ scale: finalScale, rotation: totalRotation });

  pageMetricsCache.set(pageNum, {
    pageViewport: viewport,
    pdfWidth: unscaledViewport.width,
    pdfHeight: unscaledViewport.height,
    userRotation: userRot,
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
  pageOverlayMap.set(pageNum, overlay);

  const header = document.createElement("div");
  header.className = "pdf-page-header";

  const badge = document.createElement("span");
  badge.className = "pdf-page-badge";
  badge.textContent = `Page ${pageNum}`;

  const rotateBtn = document.createElement("button");
  rotateBtn.className = "pdf-page-action-btn rotate-btn";
  rotateBtn.title = "Rotate 90° clockwise";
  rotateBtn.setAttribute("aria-label", `Rotate page ${pageNum} clockwise`);
  rotateBtn.textContent = "🔄";
  rotateBtn.onclick = (e) => {
    e.stopPropagation();
    rotatePage(pageNum, 90);
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "pdf-page-action-btn delete-btn";
  deleteBtn.title = "Delete page";
  deleteBtn.setAttribute("aria-label", `Delete page ${pageNum}`);
  deleteBtn.textContent = "🗑️";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deletePage(pageNum);
  };

  header.appendChild(badge);
  header.appendChild(rotateBtn);
  header.appendChild(deleteBtn);

  pageWrapper.appendChild(canvas);
  pageWrapper.appendChild(overlay);
  pageWrapper.appendChild(header);

  pagesScrollArea.appendChild(pageWrapper);

  if (pagezoomPill) {
    pagesScrollArea.appendChild(pagezoomPill);
  }

  setupOverlayEvents(overlay, pageNum);

  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
  } finally {
    if (page && typeof page.cleanup === "function") {
      page.cleanup();
    }
  }

  renderAllObjects();
  renderSidebarThumbnails();
}

export async function renderSidebarThumbnails() {
  if (!sidebarThumbsContainer || !sidebarEl || sidebarEl.style.display === "none") return;

  const existingCanvases = sidebarThumbsContainer.querySelectorAll("canvas");
  existingCanvases.forEach((c) => {
    c.width = 0;
    c.height = 0;
  });
  sidebarThumbsContainer.innerHTML = "";

  const activePages = getActivePages();
  const pagePromises = activePages.map((pageNum) => pdfjsDocument.getPage(pageNum));
  const pages = await Promise.all(pagePromises);

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const pageNum = activePages[index];
    const userRot = pageRotations.get(pageNum) || 0;
    const totalRotation = (page.rotate + userRot) % 360;

    const thumbViewport = page.getViewport({ scale: 0.2, rotation: totalRotation });

    const card = document.createElement("div");
    card.className = `thumb-card ${pageNum === currentPageIndex ? "active" : ""}`;
    card.dataset.pageNum = pageNum;
    card.dataset.index = index;
    card.draggable = true;

    // Drag and drop event listeners for sidebar reordering
    card.addEventListener("dragstart", (e) => {
      draggedCardIndex = index;
      card.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      if (sidebarThumbsContainer) {
        sidebarThumbsContainer.querySelectorAll(".thumb-card").forEach((c) => {
          c.classList.remove("drag-over");
        });
      }
      draggedCardIndex = null;
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      if (draggedCardIndex !== null && draggedCardIndex !== index) {
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const fromIdx = draggedCardIndex !== null ? draggedCardIndex : parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (!isNaN(fromIdx) && fromIdx !== index) {
        reorderPage(fromIdx, index);
      }
    });

    const wrap = document.createElement("div");
    wrap.className = "thumb-card-canvas-wrap";

    const canvas = document.createElement("canvas");
    canvas.width = thumbViewport.width;
    canvas.height = thumbViewport.height;

    const ctx = canvas.getContext("2d");
    wrap.appendChild(canvas);

    const footer = document.createElement("div");
    footer.className = "thumb-card-footer";

    const label = document.createElement("span");
    label.textContent = `P. ${pageNum}`;

    const actions = document.createElement("div");
    actions.className = "thumb-card-actions";

    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "thumb-card-btn move-up-btn";
    moveUpBtn.title = "Move page up";
    moveUpBtn.setAttribute("aria-label", `Move page ${pageNum} up`);
    moveUpBtn.textContent = "⬆️";
    if (index === 0) {
      moveUpBtn.disabled = true;
      moveUpBtn.style.opacity = "0.4";
      moveUpBtn.style.cursor = "not-allowed";
    } else {
      moveUpBtn.onclick = (e) => {
        e.stopPropagation();
        reorderPage(index, index - 1);
      };
    }

    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "thumb-card-btn move-down-btn";
    moveDownBtn.title = "Move page down";
    moveDownBtn.setAttribute("aria-label", `Move page ${pageNum} down`);
    moveDownBtn.textContent = "⬇️";
    if (index === pages.length - 1) {
      moveDownBtn.disabled = true;
      moveDownBtn.style.opacity = "0.4";
      moveDownBtn.style.cursor = "not-allowed";
    } else {
      moveDownBtn.onclick = (e) => {
        e.stopPropagation();
        reorderPage(index, index + 1);
      };
    }

    const rotateBtn = document.createElement("button");
    rotateBtn.className = "thumb-card-btn";
    rotateBtn.title = "Rotate";
    rotateBtn.setAttribute("aria-label", `Rotate page ${pageNum} clockwise`);
    rotateBtn.textContent = "🔄";
    rotateBtn.onclick = (e) => {
      e.stopPropagation();
      rotatePage(pageNum, 90);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "thumb-card-btn";
    deleteBtn.title = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete page ${pageNum}`);
    deleteBtn.textContent = "🗑️";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deletePage(pageNum);
    };

    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);
    actions.appendChild(rotateBtn);
    actions.appendChild(deleteBtn);
    footer.appendChild(label);
    footer.appendChild(actions);

    card.appendChild(wrap);
    card.appendChild(footer);

    card.onclick = () => {
      currentPageIndex = pageNum;
      scrollToPage(pageNum);
      renderSidebarThumbnails();
    };

    sidebarThumbsContainer.appendChild(card);

    page.render({ canvasContext: ctx, viewport: thumbViewport }).promise.then(() => {
      if (page && typeof page.cleanup === "function") page.cleanup();
    });
  }
}

if (toggleSidebarBtn && sidebarEl) {
  toggleSidebarBtn.addEventListener("click", () => {
    const isHidden = sidebarEl.style.display === "none";
    sidebarEl.style.display = isHidden ? "flex" : "none";
    toggleSidebarBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    toggleSidebarBtn.classList.toggle("active", isHidden);
    if (isHidden) {
      renderSidebarThumbnails();
    }
  });
}

if (sidebarCloseBtn && sidebarEl) {
  sidebarCloseBtn.addEventListener("click", () => {
    sidebarEl.style.display = "none";
    if (toggleSidebarBtn) {
      toggleSidebarBtn.setAttribute("aria-expanded", "false");
      toggleSidebarBtn.classList.remove("active");
    }
  });
}

// ── Page Navigation Controls ─────────────────────────────────────

function scrollToPage(pageNum) {
  const active = getActivePages();
  if (active.includes(pageNum)) {
    currentPageIndex = pageNum;
    renderAllPages();
  }
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    const active = getActivePages();
    const activeIdx = active.indexOf(currentPageIndex);
    if (activeIdx > 0) {
      currentPageIndex = active[activeIdx - 1];
      renderAllPages();
    }
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    const active = getActivePages();
    const activeIdx = active.indexOf(currentPageIndex);
    if (activeIdx !== -1 && activeIdx < active.length - 1) {
      currentPageIndex = active[activeIdx + 1];
      renderAllPages();
    }
  });
}

// ── Zoom Controls & Pinch Gesture ──────────────────────────────────

export function updateZoom(newZoom) {
  zoomLevel = Math.max(0.25, Math.min(3.0, newZoom));
  if (zoomValLabel) {
    zoomValLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
  renderAllPages();
}

export function getZoomLevel() {
  return zoomLevel;
}

export function getPinchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function handlePinchStart(e) {
  if (e.touches && e.touches.length === 2) {
    initialPinchDistance = getPinchDistance(e.touches);
    initialPinchZoom = zoomLevel;
  }
}

export function handlePinchMove(e) {
  if (e.touches && e.touches.length === 2 && initialPinchDistance && initialPinchDistance > 0) {
    if (e.cancelable) e.preventDefault();
    const currentDistance = getPinchDistance(e.touches);
    const scale = currentDistance / initialPinchDistance;
    const targetZoom = initialPinchZoom * scale;
    updateZoom(targetZoom);
  }
}

export function handlePinchEnd(e) {
  if (!e.touches || e.touches.length < 2) {
    initialPinchDistance = null;
  }
}

if (pagesScrollArea) {
  pagesScrollArea.addEventListener("touchstart", handlePinchStart, { passive: true });
  pagesScrollArea.addEventListener("touchmove", handlePinchMove, { passive: false });
  pagesScrollArea.addEventListener("touchend", handlePinchEnd);
  pagesScrollArea.addEventListener("touchcancel", handlePinchEnd);
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

      if (activeTool !== "select" && selectedObjId) {
        selectedObjId = null;
        updateSelectedObjectUI();
      }

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
  propLayerGroup.forEach((el) => (el.style.display = "none"));
  propMultiSelectGroup.forEach((el) => (el.style.display = "none"));

  let hasVisibleProps = false;

  if (selectedObjIds.size > 1) {
    propMultiSelectGroup.forEach((el) => (el.style.display = "flex"));
    if (propMultiCount) propMultiCount.textContent = `${selectedObjIds.size} items selected`;
    if (deleteObjBtn) {
      deleteObjBtn.title = `Delete Selected (${selectedObjIds.size})`;
      deleteObjBtn.setAttribute("aria-label", `Delete ${selectedObjIds.size} selected objects`);
      const btnText = deleteObjBtn.querySelector(".btn-text");
      if (btnText) btnText.textContent = `Delete (${selectedObjIds.size})`;
    }
    hasVisibleProps = true;
  } else if (deleteObjBtn) {
    deleteObjBtn.title = "Delete Selected";
    deleteObjBtn.setAttribute("aria-label", "Delete selected object");
    const btnText = deleteObjBtn.querySelector(".btn-text");
    if (btnText) btnText.textContent = "Delete";
  }

  if (activeTool === "text") {
    propTextGroup.forEach((el) => (el.style.display = "flex"));
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    if (propFontSize) propFontSize.value = "18";
    if (propFontFamily) propFontFamily.value = "sans-serif";
    if (propTextAlign) propTextAlign.value = "left";
    if (propColor) propColor.value = "#000000";
    if (propBold) {
      propBold.classList.remove("active");
      if (propBold.setAttribute) propBold.setAttribute("aria-pressed", "false");
    }
    if (propItalic) {
      propItalic.classList.remove("active");
      if (propItalic.setAttribute) propItalic.setAttribute("aria-pressed", "false");
    }
    if (propTextBgColor) propTextBgColor.value = "#ffffff";
    if (propTextBgTransparent) {
      propTextBgTransparent.classList.add("active");
      if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", "true");
    }
    if (propTextPadding) propTextPadding.value = "4";
    hasVisibleProps = true;
  } else if (activeTool === "highlight") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propOpacityGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  } else if (activeTool === "draw") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propStrokeGroup.forEach((el) => (el.style.display = "flex"));
    if (propStrokeWidth) propStrokeWidth.value = "2";
    if (propStrokeStyle) propStrokeStyle.value = "solid";
    hasVisibleProps = true;
  } else if (activeTool === "shape") {
    propColorGroup.forEach((el) => (el.style.display = "flex"));
    propShapeGroup.forEach((el) => (el.style.display = "flex"));
    propStrokeGroup.forEach((el) => (el.style.display = "flex"));
    if (propStrokeWidth) propStrokeWidth.value = "2";
    if (propStrokeStyle) propStrokeStyle.value = "solid";
    hasVisibleProps = true;
  } else if (activeTool === "select" && selectedObjId) {
    const obj = editorObjects.find((o) => o.id === selectedObjId);
    if (obj) {
      const props = obj.properties || {};
      if (obj.type === "text") {
        propTextGroup.forEach((el) => (el.style.display = "flex"));
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        if (propFontSize) propFontSize.value = String(props.fontSize || 18);
        if (propFontFamily) propFontFamily.value = props.fontFamily || "sans-serif";
        if (propTextAlign) propTextAlign.value = props.textAlign || "left";
        if (propColor) propColor.value = props.color || "#000000";
        if (propBold && propBold.classList) {
          const isBold = !!props.bold;
          propBold.classList.toggle("active", isBold);
          if (propBold.setAttribute) propBold.setAttribute("aria-pressed", isBold ? "true" : "false");
        }
        if (propItalic && propItalic.classList) {
          const isItalic = !!props.italic;
          propItalic.classList.toggle("active", isItalic);
          if (propItalic.setAttribute) propItalic.setAttribute("aria-pressed", isItalic ? "true" : "false");
        }
        const bgColor = props.bgColor || "transparent";
        const isTransparentBg = bgColor === "transparent";
        if (propTextBgColor) propTextBgColor.value = isTransparentBg ? "#ffffff" : bgColor;
        if (propTextBgTransparent && propTextBgTransparent.classList) {
          propTextBgTransparent.classList.toggle("active", isTransparentBg);
          if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", isTransparentBg ? "true" : "false");
        }
        if (propTextPadding) propTextPadding.value = String(props.padding ?? 4);
        hasVisibleProps = true;
      } else if (obj.type === "highlight") {
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        propOpacityGroup.forEach((el) => (el.style.display = "flex"));
        hasVisibleProps = true;
      } else if (obj.type === "draw" || obj.type === "shape") {
        propColorGroup.forEach((el) => (el.style.display = "flex"));
        propStrokeGroup.forEach((el) => (el.style.display = "flex"));
        if (propStrokeWidth) propStrokeWidth.value = String(props.strokeWidth || 2);
        if (propStrokeStyle) propStrokeStyle.value = props.strokeStyle || "solid";
        if (obj.type === "shape") {
          propShapeGroup.forEach((el) => (el.style.display = "flex"));
          if (propShapeType) propShapeType.value = props.shapeType || "rect";
        }
        hasVisibleProps = true;
      }
    }
  }

  if (selectedObjId) {
    propLayerGroup.forEach((el) => (el.style.display = "flex"));
    hasVisibleProps = true;
  }

  if (propsBar) {
    propsBar.style.display = hasVisibleProps ? "flex" : "none";
  }

  syncColorSwatches();
}

export function syncColorSwatches() {
  document.querySelectorAll(".color-swatches-wrap").forEach((wrap) => {
    const targetId = wrap.dataset.target;
    if (!targetId) return;
    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;

    let isTransparent = false;
    if (targetId === "prop-text-bg-color" && propTextBgTransparent) {
      isTransparent = propTextBgTransparent.classList.contains("active");
    } else if (targetId === "prop-fill-color" && propTransparentFill) {
      isTransparent = propTransparentFill.dataset.none === "true" || propTransparentFill.getAttribute("aria-pressed") === "true";
    }

    const currentVal = targetInput.value ? targetInput.value.toLowerCase() : "";

    wrap.querySelectorAll(".color-swatch").forEach((swatch) => {
      const swatchColor = swatch.dataset.color ? swatch.dataset.color.toLowerCase() : "";
      const isActive = !isTransparent && swatchColor === currentVal;
      swatch.classList.toggle("active", isActive);
      if (swatch.setAttribute) {
        swatch.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    });
  });
}

document.querySelectorAll(".color-swatch").forEach((swatch) => {
  swatch.addEventListener("click", () => {
    const wrap = swatch.closest(".color-swatches-wrap");
    const targetId = wrap ? wrap.dataset.target : null;
    const targetInput = targetId ? document.getElementById(targetId) : null;
    const chosenColor = swatch.dataset.color;

    if (targetInput && chosenColor) {
      targetInput.value = chosenColor;

      if (targetId === "prop-text-bg-color" && propTextBgTransparent) {
        propTextBgTransparent.classList.remove("active");
        if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", "false");
      }
      if (targetId === "prop-fill-color" && propTransparentFill) {
        propTransparentFill.dataset.none = "false";
        if (propTransparentFill.setAttribute) propTransparentFill.setAttribute("aria-pressed", "false");
      }

      applyPropChangesToSelected();
      syncColorSwatches();
    }
  });
});

if (propLayerFront) {
  propLayerFront.addEventListener("click", () => {
    if (selectedObjId) moveObjectZOrder(selectedObjId, "front");
  });
}
if (propLayerForward) {
  propLayerForward.addEventListener("click", () => {
    if (selectedObjId) moveObjectZOrder(selectedObjId, "forward");
  });
}
if (propLayerBackward) {
  propLayerBackward.addEventListener("click", () => {
    if (selectedObjId) moveObjectZOrder(selectedObjId, "backward");
  });
}
if (propLayerBack) {
  propLayerBack.addEventListener("click", () => {
    if (selectedObjId) moveObjectZOrder(selectedObjId, "back");
  });
}

// Property change listeners
[propFontSize, propFontFamily, propTextAlign, propColor, propShapeType, propFillColor, propStrokeWidth, propStrokeStyle, propOpacity, propTextPadding].forEach((input) => {
  if (input) {
    input.addEventListener("input", applyPropChangesToSelected);
    input.addEventListener("change", applyPropChangesToSelected);
  }
});

if (propTextBgColor) {
  propTextBgColor.addEventListener("input", () => {
    if (propTextBgTransparent) {
      propTextBgTransparent.classList.remove("active");
      if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", "false");
    }
    applyPropChangesToSelected();
    syncColorSwatches();
  });
  propTextBgColor.addEventListener("change", () => {
    if (propTextBgTransparent) {
      propTextBgTransparent.classList.remove("active");
      if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", "false");
    }
    applyPropChangesToSelected();
    syncColorSwatches();
  });
}

if (propTextBgTransparent) {
  propTextBgTransparent.addEventListener("click", () => {
    const isActive = propTextBgTransparent.classList.toggle("active");
    if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", isActive ? "true" : "false");
    applyPropChangesToSelected();
    syncColorSwatches();
  });
}

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

if (propFillColor) {
  propFillColor.addEventListener("input", () => {
    if (propTransparentFill) {
      propTransparentFill.dataset.none = "false";
      if (propTransparentFill.setAttribute) propTransparentFill.setAttribute("aria-pressed", "false");
    }
    syncColorSwatches();
  });
}

if (propTransparentFill) {
  propTransparentFill.addEventListener("click", () => {
    const isNone = propTransparentFill.dataset.none === "true";
    const newNone = !isNone;
    if (newNone) propFillColor.value = "#ffffff";
    propTransparentFill.dataset.none = newNone ? "true" : "false";
    if (propTransparentFill.setAttribute) propTransparentFill.setAttribute("aria-pressed", newNone ? "true" : "false");
    applyPropChangesToSelected();
    syncColorSwatches();
  });
}

function applyPropChangesToSelected() {
  if (selectedObjIds.size === 0) return;

  saveState();

  selectedObjIds.forEach((id) => {
    const obj = editorObjects.find((o) => o.id === id);
    if (!obj) return;

    const props = obj.properties || {};
    if (obj.type === "text") {
      props.fontSize = parseInt(propFontSize.value, 10) || 18;
      props.fontFamily = propFontFamily.value;
      if (propTextAlign) props.textAlign = propTextAlign.value;
      props.color = propColor.value;
      props.bold = propBold.classList.contains("active");
      props.italic = propItalic.classList.contains("active");
      if (propTextBgTransparent && propTextBgTransparent.classList.contains("active")) {
        props.bgColor = "transparent";
      } else if (propTextBgColor) {
        props.bgColor = propTextBgColor.value;
      }
      if (propTextPadding) {
        props.padding = Math.max(0, parseInt(propTextPadding.value, 10) || 0);
      }
    } else if (obj.type === "highlight") {
      props.color = propColor.value;
      props.opacity = parseFloat(propOpacity.value) || 0.5;
    } else if (obj.type === "draw") {
      props.color = propColor.value;
      props.strokeWidth = parseInt(propStrokeWidth.value, 10) || 2;
      if (propStrokeStyle) props.strokeStyle = propStrokeStyle.value || "solid";
    } else if (obj.type === "shape") {
      props.shapeType = propShapeType.value;
      props.strokeColor = propColor.value;
      props.fillColor = propTransparentFill.dataset.none === "true" ? "none" : propFillColor.value;
      props.strokeWidth = parseInt(propStrokeWidth.value, 10) || 2;
      if (propStrokeStyle) props.strokeStyle = propStrokeStyle.value || "solid";
    }
  });

  renderAllObjects();
}

// ── Overlay Events & Object Creation ────────────────────────────────

export function updateSelectedObjectUI() {
  document.querySelectorAll(".editor-obj.selected").forEach((node) => {
    if (!selectedObjIds.has(node.dataset.objId)) {
      node.classList.remove("selected");
    }
  });

  selectedObjIds.forEach((id) => {
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const target = document.querySelector(`.editor-obj[data-obj-id="${safeId}"]`);
    if (target) {
      target.classList.add("selected");
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
        textAlign: propTextAlign ? propTextAlign.value || "left" : "left",
        color: propColor.value || "#000000",
        bold: propBold ? propBold.classList.contains("active") : false,
        italic: propItalic ? propItalic.classList.contains("active") : false,
        bgColor: (propTextBgTransparent && propTextBgTransparent.classList.contains("active")) ? "transparent" : (propTextBgColor ? propTextBgColor.value : "transparent"),
        padding: propTextPadding ? Math.max(0, parseInt(propTextPadding.value, 10) || 0) : 4,
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
        strokeStyle: propStrokeStyle ? propStrokeStyle.value || "solid" : "solid",
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
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  tempCanvas.width = overlay.offsetWidth * dpr;
  tempCanvas.height = overlay.offsetHeight * dpr;
  tempCanvas.style.width = `${overlay.offsetWidth}px`;
  tempCanvas.style.height = `${overlay.offsetHeight}px`;
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
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

  ctx.save();
  ctx.scale(dpr, dpr);
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
  ctx.restore();
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
      strokeStyle: propStrokeStyle ? propStrokeStyle.value || "solid" : "solid",
      initialWidth: w,
      initialHeight: h,
    },
  };
}

function setupOverlayEvents(overlay, pageNum) {
  let isDrawing = false;
  let currentPath = [];
  let tempCanvas = null;

  let isMarquee = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;
  let marqueeEl = null;

  const handlePointerDown = (e) => {
    if (e.target !== overlay) return;

    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    const rect = overlay.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    if (activeTool === "select") {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        deselectAllObjects();
      }
      isMarquee = true;
      marqueeStartX = clickX;
      marqueeStartY = clickY;

      marqueeEl = document.createElement("div");
      marqueeEl.className = "editor-selection-marquee";
      marqueeEl.style.left = `${clickX}px`;
      marqueeEl.style.top = `${clickY}px`;
      marqueeEl.style.width = "0px";
      marqueeEl.style.height = "0px";
      overlay.appendChild(marqueeEl);
      return;
    }

    if (e.type && e.type.includes("touch") && e.cancelable) {
      e.preventDefault();
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
  };

  const handlePointerMove = (e) => {
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    const rect = overlay.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (isMarquee && marqueeEl) {
      const left = Math.min(marqueeStartX, x);
      const top = Math.min(marqueeStartY, y);
      const width = Math.abs(x - marqueeStartX);
      const height = Math.abs(y - marqueeStartY);

      marqueeEl.style.left = `${left}px`;
      marqueeEl.style.top = `${top}px`;
      marqueeEl.style.width = `${width}px`;
      marqueeEl.style.height = `${height}px`;

      if (e.type && e.type.includes("touch") && e.cancelable) {
        e.preventDefault();
      }
      return;
    }

    if (!isDrawing || !tempCanvas) return;

    updateDrawingPath(tempCanvas, currentPath, x, y);

    if (e.type && e.type.includes("touch") && e.cancelable) {
      e.preventDefault();
    }
  };

  const finishDrawing = () => {
    if (isMarquee) {
      isMarquee = false;
      if (marqueeEl) {
        const marqueeRect = {
          x: parseFloat(marqueeEl.style.left) || 0,
          y: parseFloat(marqueeEl.style.top) || 0,
          width: parseFloat(marqueeEl.style.width) || 0,
          height: parseFloat(marqueeEl.style.height) || 0,
        };
        marqueeEl.remove();
        marqueeEl = null;

        if (marqueeRect.width > 2 || marqueeRect.height > 2) {
          const pageObjs = editorObjects.filter((o) => o.pageNum === pageNum);
          let matchedAny = false;
          pageObjs.forEach((o) => {
            const intersects =
              o.x < marqueeRect.x + marqueeRect.width &&
              o.x + o.width > marqueeRect.x &&
              o.y < marqueeRect.y + marqueeRect.height &&
              o.y + o.height > marqueeRect.y;

            if (intersects) {
              selectedObjIds.add(o.id);
              matchedAny = true;
            }
          });
          if (matchedAny) {
            selectedObjId = Array.from(selectedObjIds)[selectedObjIds.size - 1];
            updateSelectedObjectUI();
            updatePropsBarVisibility();
          }
        }
      }
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;

    if (tempCanvas) {
      tempCanvas.remove();
      tempCanvas = null;
    }

    const drawObj = finishDrawingPath(currentPath, pageNum);
    if (drawObj) {
      editorObjects.push(drawObj);
      setSelectedObjId(drawObj.id);
      renderAllObjects();
    }
  };

  overlay.addEventListener("mousedown", handlePointerDown);
  overlay.addEventListener("touchstart", handlePointerDown, { passive: false });

  overlay.addEventListener("mousemove", handlePointerMove);
  overlay.addEventListener("touchmove", handlePointerMove, { passive: false });

  overlay.addEventListener("mouseup", finishDrawing);
  overlay.addEventListener("touchend", finishDrawing);
  overlay.addEventListener("touchcancel", finishDrawing);
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

function applyStrokeDashStyle(ctx, strokeStyle, strokeWidth) {
  const w = strokeWidth || 2;
  if (typeof ctx.setLineDash !== "function") return;
  if (strokeStyle === "dashed") {
    ctx.setLineDash([w * 3, w * 2]);
  } else if (strokeStyle === "dotted") {
    ctx.setLineDash([w, w * 1.5]);
  } else {
    ctx.setLineDash([]);
  }
}

function drawCanvasPath(canvas, properties) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = properties.color || "#000000";
  ctx.lineWidth = properties.strokeWidth || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  applyStrokeDashStyle(ctx, properties.strokeStyle, properties.strokeWidth);

  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  const initW = properties.initialWidth || cssWidth;
  const initH = properties.initialHeight || cssHeight;
  const scaleX = initW > 0 ? cssWidth / initW : 1;
  const scaleY = initH > 0 ? cssHeight / initH : 1;

  ctx.save();
  ctx.scale(dpr * scaleX, dpr * scaleY);

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
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.strokeStyle = properties.strokeColor || "#000000";
  ctx.lineWidth = properties.strokeWidth || 2;
  applyStrokeDashStyle(ctx, properties.strokeStyle, properties.strokeWidth);

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
  ctx.restore();
}

function updateObjectInternalDimensions(el, obj) {
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  if (obj.type === "draw") {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      canvas.width = obj.width * dpr;
      canvas.height = obj.height * dpr;
      drawCanvasPath(canvas, obj.properties);
    }
  } else if (obj.type === "shape") {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      canvas.width = obj.width * dpr;
      canvas.height = obj.height * dpr;
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
    textarea.style.textAlign = obj.properties.textAlign || "left";
    textarea.style.color = obj.properties.color;
    textarea.style.fontWeight = obj.properties.bold ? "bold" : "normal";
    textarea.style.fontStyle = obj.properties.italic ? "italic" : "normal";
    textarea.style.backgroundColor = obj.properties.bgColor || "transparent";
    textarea.style.padding = `${obj.properties.padding ?? 4}px`;

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
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = obj.width * dpr;
    canvas.height = obj.height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    if (!obj.properties.initialWidth) obj.properties.initialWidth = obj.width;
    if (!obj.properties.initialHeight) obj.properties.initialHeight = obj.height;

    drawCanvasPath(canvas, obj.properties);
    el.appendChild(canvas);
  } else if (obj.type === "shape") {
    const canvas = document.createElement("canvas");
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = obj.width * dpr;
    canvas.height = obj.height * dpr;
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
  moveHandle.setAttribute("role", "button");
  moveHandle.setAttribute("aria-label", "Move object");
  moveHandle.setAttribute("tabindex", "0");

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "editor-obj-handle se";
  resizeHandle.setAttribute("role", "button");
  resizeHandle.setAttribute("aria-label", "Resize object");
  resizeHandle.setAttribute("tabindex", "0");

  const deleteHandle = document.createElement("div");
  deleteHandle.className = "editor-obj-handle delete";
  deleteHandle.textContent = "✕";
  deleteHandle.setAttribute("role", "button");
  deleteHandle.setAttribute("aria-label", "Delete object");
  deleteHandle.setAttribute("tabindex", "0");
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
    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!selectedObjIds.has(obj.id) || isMulti) {
      selectObject(obj.id, isMulti);
    }
  });

  makeObjectDraggableAndResizable(el, obj, resizeHandle, deleteHandle, moveHandle);
}

export function renderAllObjects() {
  if (pageOverlayMap.size === 0) {
    const overlays = document.querySelectorAll(".pdf-page-overlay");
    overlays.forEach((overlay) => {
      const pageNum = parseInt(overlay.dataset.pageNum, 10);
      if (!isNaN(pageNum)) {
        pageOverlayMap.set(pageNum, overlay);
      }
    });
  }

  pageOverlayMap.forEach((overlay) => {
    overlay.innerHTML = "";
  });

  editorObjects.forEach((obj) => {
    const overlay = pageOverlayMap.get(obj.pageNum);
    if (!overlay) return;
    renderSingleObject(obj, overlay);
  });
}

function makeObjectDraggableAndResizable(el, obj, resizeHandle, deleteHandle, moveHandle) {
  makeObjectDraggable(el, obj, resizeHandle, deleteHandle, moveHandle);
  makeObjectResizable(el, obj, resizeHandle);
}

function makeObjectDraggable(el, obj, resizeHandle, deleteHandle, moveHandle) {
  let isDragging = false;
  let startX, startY;
  let startLeft, startTop;
  let initialPositions = new Map();

  const startDrag = (e) => {
    if (e.target === deleteHandle || e.target === resizeHandle) return;
    if (e.target.tagName === "TEXTAREA" && e.target !== moveHandle) {
      return;
    }

    isDragging = true;
    if (el.classList) el.classList.add("is-dragging");
    if (moveHandle && moveHandle.classList) moveHandle.classList.add("is-active");

    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startLeft = obj.x;
    startTop = obj.y;

    initialPositions.clear();
    selectedObjIds.forEach((id) => {
      const o = editorObjects.find((item) => item.id === id);
      if (o) {
        initialPositions.set(id, { x: o.x, y: o.y });
      }
    });

    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("mouseup", onDragEnd);
    document.addEventListener("touchend", onDragEnd);

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  if (moveHandle) {
    moveHandle.addEventListener("mousedown", startDrag);
    moveHandle.addEventListener("touchstart", startDrag, { passive: false });
  }

  el.addEventListener("mousedown", startDrag);
  el.addEventListener("touchstart", startDrag, { passive: false });

  const onDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (selectedObjIds.has(obj.id) && selectedObjIds.size > 1) {
      selectedObjIds.forEach((id) => {
        const o = editorObjects.find((item) => item.id === id);
        const initPos = initialPositions.get(id);
        if (o && initPos) {
          const overlay = pageOverlayMap.get(o.pageNum);
          const maxLeft = overlay ? Math.max(0, overlay.clientWidth - o.width) : 2000;
          const maxTop = overlay ? Math.max(0, overlay.clientHeight - o.height) : 2000;

          o.x = Math.max(0, Math.min(maxLeft, initPos.x + dx));
          o.y = Math.max(0, Math.min(maxTop, initPos.y + dy));

          const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(o.id) : o.id;
          const targetEl = document.querySelector(`.editor-obj[data-obj-id="${safeId}"]`);
          if (targetEl) {
            targetEl.style.left = `${o.x}px`;
            targetEl.style.top = `${o.y}px`;
          }
        }
      });
    } else {
      const overlay = el.parentElement;
      const maxLeft = overlay ? Math.max(0, overlay.clientWidth - obj.width) : 2000;
      const maxTop = overlay ? Math.max(0, overlay.clientHeight - obj.height) : 2000;

      obj.x = Math.max(0, Math.min(maxLeft, startLeft + dx));
      obj.y = Math.max(0, Math.min(maxTop, startTop + dy));

      el.style.left = `${obj.x}px`;
      el.style.top = `${obj.y}px`;
    }

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  const onDragEnd = () => {
    if (isDragging) {
      saveState();
    }
    isDragging = false;
    if (el.classList) el.classList.remove("is-dragging");
    if (moveHandle && moveHandle.classList) moveHandle.classList.remove("is-active");

    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("touchmove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    document.removeEventListener("touchend", onDragEnd);
  };
}

function makeObjectResizable(el, obj, resizeHandle) {
  let isResizing = false;
  let startX, startY;
  let startWidth, startHeight;

  const startResize = (e) => {
    e.stopPropagation();
    isResizing = true;
    if (el.classList) el.classList.add("is-resizing");
    if (resizeHandle && resizeHandle.classList) resizeHandle.classList.add("is-active");

    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startWidth = obj.width;
    startHeight = obj.height;

    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("touchmove", onResizeMove, { passive: false });
    document.addEventListener("mouseup", onResizeEnd);
    document.addEventListener("touchend", onResizeEnd);

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  if (resizeHandle) {
    resizeHandle.addEventListener("mousedown", startResize);
    resizeHandle.addEventListener("touchstart", startResize, { passive: false });
  }

  const onResizeMove = (e) => {
    if (!isResizing) return;
    const clientX = e.type && e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
    const clientY = e.type && e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;

    // Preserve aspect ratio for image and signature objects, or when Shift key is held
    const keepRatio = obj.type === "image" || obj.type === "signature" || (e.shiftKey === true);

    if (keepRatio && startWidth > 0 && startHeight > 0) {
      const aspectRatio = startWidth / startHeight;
      const targetW = Math.max(20, startWidth + dx);
      obj.width = targetW;
      obj.height = targetW / aspectRatio;
    } else {
      obj.width = Math.max(20, startWidth + dx);
      obj.height = Math.max(20, startHeight + dy);
    }

    el.style.width = `${obj.width}px`;
    el.style.height = `${obj.height}px`;

    updateObjectInternalDimensions(el, obj);

    if (e.type && e.type.includes("touch")) e.preventDefault();
  };

  const onResizeEnd = () => {
    if (isResizing) {
      saveState();
    }
    isResizing = false;
    if (el.classList) el.classList.remove("is-resizing");
    if (resizeHandle && resizeHandle.classList) resizeHandle.classList.remove("is-active");

    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("touchmove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
    document.removeEventListener("touchend", onResizeEnd);
  };
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
  applyStrokeDashStyle(ctx, obj.properties.strokeStyle, obj.properties.strokeWidth);

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
  applyStrokeDashStyle(ctx, obj.properties.strokeStyle, obj.properties.strokeWidth);

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
  const scale = pageMetrics.pdfWidth / pageMetrics.pageViewport.width;
  const size = (obj.properties.fontSize || 18) * scale;
  const color = hexToPdfRgb(obj.properties.color || "#000000");
  const align = obj.properties.textAlign || "left";
  const bgColor = obj.properties.bgColor || "transparent";
  const padding = (obj.properties.padding ?? 0) * scale;

  if (bgColor && bgColor !== "transparent" && page.drawRectangle) {
    page.drawRectangle({
      x: pdfCoords.x,
      y: pdfCoords.y,
      width: pdfCoords.width,
      height: pdfCoords.height,
      color: hexToPdfRgb(bgColor),
    });
  }

  let font = fonts.fontHelvetica;
  if (obj.properties.bold) font = fonts.fontHelveticaBold;
  else if (obj.properties.italic) font = fonts.fontHelveticaOblique;

  const printableWidth = Math.max(10, pdfCoords.width - padding * 2);
  const rawLines = text.split("\n");
  const wrappedLines = [];

  rawLines.forEach((rawLine) => {
    if (!rawLine) {
      wrappedLines.push("");
      return;
    }

    const words = rawLine.split(" ");
    let currentLine = "";

    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candidateWidth = font.widthOfTextAtSize ? font.widthOfTextAtSize(candidate, size) : candidate.length * size * 0.5;

      if (candidateWidth <= printableWidth || !currentLine) {
        currentLine = candidate;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  });

  wrappedLines.forEach((line, lIdx) => {
    const lineWidth = font.widthOfTextAtSize ? font.widthOfTextAtSize(line, size) : line.length * size * 0.5;
    let lineX = pdfCoords.x + padding;

    if (align === "center") {
      lineX = pdfCoords.x + padding + (printableWidth - lineWidth) / 2;
    } else if (align === "right") {
      lineX = pdfCoords.x + pdfCoords.width - padding - lineWidth;
    }

    page.drawText(line, {
      x: lineX,
      y: pdfCoords.y + pdfCoords.height - padding - size * 1.1 * (lIdx + 1),
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
  const userRot = pageMetrics.userRotation || 0;
  const pdfCoords = domToPdfCoords(
    { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
    pageMetrics.pageViewport,
    { width: pageMetrics.pdfWidth, height: pageMetrics.pdfHeight },
    userRot
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

  await new Promise((r) => setTimeout(r, 50));

  try {
    const { PDFDocument, StandardFonts, degrees } = window.PDFLib;
    const srcPdfDoc = await PDFDocument.load(pdfBytesOriginal, { ignoreEncryption: true });

    const activePages = getActivePages();
    const keepIndices = activePages.map((p) => p - 1);

    const pdfDoc = await PDFDocument.create();
    const copiedPages = await pdfDoc.copyPages(srcPdfDoc, keepIndices);

    const pageNumToDestPage = new Map();
    copiedPages.forEach((page, idx) => {
      const pageNum = activePages[idx];
      const relRot = pageRotations.get(pageNum) || 0;
      if (relRot !== 0) {
        const existingRot = page.getRotation ? page.getRotation().angle : 0;
        page.setRotation(degrees((existingRot + relRot) % 360));
      }
      pdfDoc.addPage(page);
      pageNumToDestPage.set(pageNum, page);
    });

    setProgress(progressBar, progressLabel, 30, "Embedding fonts & images...");
    const [fontHelvetica, fontHelveticaBold, fontHelveticaOblique] = await Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
      pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    ]);

    const fonts = { fontHelvetica, fontHelveticaBold, fontHelveticaOblique };
    const embeddedImages = new Map();

    setProgress(progressBar, progressLabel, 50, "Applying annotations & edits...");

    for (const pageNum of activePages) {
      if (!pageMetricsCache.has(pageNum)) {
        const page = await pdfjsDocument.getPage(pageNum);
        const userRot = pageRotations.get(pageNum) || 0;
        const totalRotation = (page.rotate + userRot) % 360;
        const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
        const maxContainerW = 800;
        const baseScale = maxContainerW / unscaledViewport.width;
        const finalScale = baseScale * zoomLevel;
        const viewport = page.getViewport({ scale: finalScale, rotation: totalRotation });
        pageMetricsCache.set(pageNum, {
          pageViewport: viewport,
          pdfWidth: unscaledViewport.width,
          pdfHeight: unscaledViewport.height,
          userRotation: userRot,
        });
      }
    }

    for (let i = 0; i < editorObjects.length; i++) {
      const obj = editorObjects[i];
      if (deletedPages.has(obj.pageNum)) continue;

      const page = pageNumToDestPage.get(obj.pageNum);
      const pageMetrics = pageMetricsCache.get(obj.pageNum);

      if (!page || !pageMetrics) continue;

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
  const state = {
    objects: editorObjects,
    rotations: Array.from(pageRotations.entries()),
    deleted: Array.from(deletedPages),
    pageOrder: [...pageOrder],
  };
  historyStack.push(JSON.stringify(state));
  redoStack = [];
  updateUndoRedoUI();
}

function applyStateObject(state) {
  if (Array.isArray(state)) {
    editorObjects = state;
  } else if (state && typeof state === "object") {
    editorObjects = state.objects || [];
    pageRotations.clear();
    if (Array.isArray(state.rotations)) {
      state.rotations.forEach(([p, r]) => pageRotations.set(p, r));
    }
    deletedPages.clear();
    if (Array.isArray(state.deleted)) {
      state.deleted.forEach((p) => deletedPages.add(p));
    }
    if (Array.isArray(state.pageOrder)) {
      pageOrder = [...state.pageOrder];
    } else if (numPages > 0) {
      pageOrder = Array.from({ length: numPages }, (_, i) => i + 1);
    }
  }
  updateUndoRedoUI();
  if (pdfjsDocument) {
    renderAllPages();
  } else {
    renderAllObjects();
  }
}

if (undoBtn) undoBtn.addEventListener("click", undoAction);
if (redoBtn) redoBtn.addEventListener("click", redoAction);

export function undoAction() {
  if (historyStack.length === 0) return;
  const currentState = {
    objects: editorObjects,
    rotations: Array.from(pageRotations.entries()),
    deleted: Array.from(deletedPages),
    pageOrder: [...pageOrder],
  };
  redoStack.push(JSON.stringify(currentState));
  const previousState = JSON.parse(historyStack.pop());
  applyStateObject(previousState);
}

export function redoAction() {
  if (redoStack.length === 0) return;
  const currentState = {
    objects: editorObjects,
    rotations: Array.from(pageRotations.entries()),
    deleted: Array.from(deletedPages),
    pageOrder: [...pageOrder],
  };
  historyStack.push(JSON.stringify(currentState));
  const nextState = JSON.parse(redoStack.pop());
  applyStateObject(nextState);
}

window.addEventListener("keydown", (e) => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  ) {
    return;
  }

  if (e.key === "Escape") {
    if (selectedObjIds.size > 0) {
      deselectAllObjects();
      e.preventDefault();
    }
    return;
  }

  if (selectedObjIds.size > 0 && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const step = e.shiftKey ? 10 : 1;
    saveState();

    selectedObjIds.forEach((id) => {
      const obj = editorObjects.find((o) => o.id === id);
      if (obj) {
        const overlay = pageOverlayMap.get(obj.pageNum);
        const maxLeft = overlay ? Math.max(0, overlay.clientWidth - obj.width) : 2000;
        const maxTop = overlay ? Math.max(0, overlay.clientHeight - obj.height) : 2000;

        if (e.key === "ArrowUp") obj.y = Math.max(0, obj.y - step);
        if (e.key === "ArrowDown") obj.y = Math.min(maxTop, obj.y + step);
        if (e.key === "ArrowLeft") obj.x = Math.max(0, obj.x - step);
        if (e.key === "ArrowRight") obj.x = Math.min(maxLeft, obj.x + step);
      }
    });

    renderAllObjects();
    e.preventDefault();
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
    if (selectedObjIds.size > 0) {
      deleteSelectedObjects();
      e.preventDefault();
    }
  }
});

export function deleteSelectedObjects() {
  if (selectedObjIds.size === 0) return;
  saveState();
  editorObjects = editorObjects.filter((o) => !selectedObjIds.has(o.id));
  deselectAllObjects();
  renderAllObjects();
}

function deleteObject(objId) {
  saveState();
  editorObjects = editorObjects.filter((o) => o.id !== objId);
  selectedObjIds.delete(objId);
  if (selectedObjId === objId) {
    selectedObjId = selectedObjIds.size > 0 ? Array.from(selectedObjIds)[selectedObjIds.size - 1] : null;
  }
  renderAllObjects();
  updatePropsBarVisibility();
}

if (deleteObjBtn) {
  deleteObjBtn.addEventListener("click", () => {
    if (selectedObjIds.size > 0) deleteSelectedObjects();
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
    } catch (err) {
      console.warn("Error destroying PDF document:", err);
    }
  }
  pdfjsDocument = null;
  pdfBytesOriginal = null;
  numPages = 0;
  currentPageIndex = 1;
  pageRotations.clear();
  deletedPages.clear();
  pageOrder = [];
  pageOverlayMap.clear();
  editorObjects = [];
  historyStack = [];
  redoStack = [];
  if (sidebarEl) sidebarEl.style.display = "none";
  if (toggleSidebarBtn) {
    toggleSidebarBtn.setAttribute("aria-expanded", "false");
    toggleSidebarBtn.classList.remove("active");
  }
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
  if (propTextBgTransparent) {
    propTextBgTransparent.classList.add("active");
    if (propTextBgTransparent.setAttribute) propTextBgTransparent.setAttribute("aria-pressed", "true");
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
