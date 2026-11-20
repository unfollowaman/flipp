// drag-drop.js — Shared drag/drop wiring and paste handling for feature pages

let registeredPasteTargets = [];
let globalPasteListenerBound = false;

export function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("image/")) return true;
  if (file.name && /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|ico|avif)$/i.test(file.name)) return true;
  return false;
}

export function isPdfFile(file) {
  if (!file) return false;
  if (file.type && (file.type === "application/pdf" || file.type.includes("pdf"))) return true;
  if (file.name && /\.pdf$/i.test(file.name)) return true;
  return false;
}

export function isTextFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("text/")) return true;
  if (file.name && /\.(txt|md|csv|log|json)$/i.test(file.name)) return true;
  return false;
}

export function getFilesFromClipboard(e) {
  const files = [];
  if (!e || !e.clipboardData) return files;

  if (e.clipboardData.files && e.clipboardData.files.length > 0) {
    for (let i = 0; i < e.clipboardData.files.length; i++) {
      files.push(e.clipboardData.files[i]);
    }
  } else if (e.clipboardData.items && e.clipboardData.items.length > 0) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item && item.kind === "file") {
        const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
        if (file) files.push(file);
      }
    }
  }
  return files;
}

export function isClipboardPastingImage(e, files = []) {
  if (files.some(isImageFile)) return true;
  if (e && e.clipboardData && e.clipboardData.items) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item && item.type && item.type.startsWith("image/")) {
        return true;
      }
    }
  }
  return false;
}

export function getAcceptedTypes(fileInputEl) {
  const accept =
    (fileInputEl &&
      typeof fileInputEl.getAttribute === "function" &&
      fileInputEl.getAttribute("accept")) ||
    (fileInputEl && fileInputEl.accept) ||
    "";

  const acceptsPdf = accept.includes("pdf") || accept.includes(".pdf");
  const acceptsImage =
    accept.includes("image") ||
    accept.includes(".png") ||
    accept.includes(".jpg") ||
    accept.includes(".jpeg") ||
    accept.includes(".webp");
  const acceptsText =
    accept.includes(".txt") ||
    accept.includes(".md") ||
    accept.includes(".csv") ||
    accept.includes(".log") ||
    accept.includes(".json") ||
    accept.includes("text/");

  return {
    accept,
    acceptsPdf,
    acceptsImage,
    acceptsText,
    isPdfOnly: acceptsPdf && !acceptsImage && !acceptsText,
    isImageOnly: acceptsImage && !acceptsPdf && !acceptsText,
    isTextOnly: acceptsText && !acceptsPdf && !acceptsImage,
    acceptsBothPdfAndImage: acceptsPdf && acceptsImage,
  };
}

function isElementVisible(el) {
  if (!el) return false;
  if (el.style && (el.style.display === "none" || el.style.visibility === "hidden")) {
    return false;
  }
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
    } catch (_) {}
  }
  if (typeof el.offsetParent !== "undefined" && el.offsetParent === null && el.tagName !== "BODY" && el.tagName !== "HTML") {
    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      try {
        const style = window.getComputedStyle(el);
        if (style.position !== "fixed") return false;
      } catch (_) {}
    }
  }
  return true;
}

export function getActivePasteTarget() {
  if (registeredPasteTargets.length === 0) return null;
  if (registeredPasteTargets.length === 1) return registeredPasteTargets[0];

  const activeEl = typeof document !== "undefined" ? document.activeElement : null;

  // 1. Direct focus within dropZoneEl
  if (activeEl) {
    const directTarget = registeredPasteTargets.find(
      (t) => t.dropZoneEl && t.dropZoneEl.contains && t.dropZoneEl.contains(activeEl),
    );
    if (directTarget) return directTarget;
  }

  // 2. Target within active/visible modal
  const modalTarget = registeredPasteTargets.find((t) => {
    if (!t.dropZoneEl) return false;
    const modal = t.dropZoneEl.closest
      ? t.dropZoneEl.closest('.modal, [role="dialog"], .is-open, .is-visible')
      : null;
    return modal && isElementVisible(modal) && isElementVisible(t.dropZoneEl);
  });
  if (modalTarget) return modalTarget;

  // 3. Visible dropZoneEl
  const visibleTarget = registeredPasteTargets.find(
    (t) => t.dropZoneEl && isElementVisible(t.dropZoneEl),
  );
  if (visibleTarget) return visibleTarget;

  // 4. Default to last registered
  return registeredPasteTargets[registeredPasteTargets.length - 1];
}

export function processClipboardPaste(e, target) {
  if (!target || !target.onFiles) return false;

  const activeEl = typeof document !== "undefined" ? document.activeElement : null;
  const isEditable =
    activeEl &&
    ((activeEl.tagName === "INPUT" && activeEl.type !== "file") ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.isContentEditable);

  const plainText =
    e && e.clipboardData && typeof e.clipboardData.getData === "function"
      ? e.clipboardData.getData("text/plain")
      : "";

  const files = getFilesFromClipboard(e);
  const tryingToPasteImage = isClipboardPastingImage(e, files);

  // If user is editing text in an input or textarea, let browser do default paste
  if (isEditable && plainText && !files.length && !tryingToPasteImage) {
    return false;
  }

  const { fileInputEl, onFiles, dropZoneEl } = target;
  const types = getAcceptedTypes(fileInputEl);

  // If clipboard has no files and no image, check if we can paste text in text-to-pdf
  if (!files.length && !tryingToPasteImage) {
    if (types.isTextOnly && plainText && !isEditable) {
      const rawInput = typeof document !== "undefined" ? document.getElementById("text-pdf-raw-input") : null;
      if (rawInput) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        rawInput.value = (rawInput.value ? rawInput.value + "\n" : "") + plainText;
        if (typeof Event === "function") {
          rawInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        showToast("Text pasted from clipboard!");
        return true;
      }
    }
    return false;
  }

  const triggerWarningVisual = () => {
    if (dropZoneEl && dropZoneEl.classList) {
      dropZoneEl.classList.add("drop-warning");
      setTimeout(() => dropZoneEl.classList.remove("drop-warning"), 600);
    }
  };

  if (types.isPdfOnly) {
    if (tryingToPasteImage) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      const pdfFiles = files.filter(isPdfFile);
      if (pdfFiles.length === 0) {
        showToast("This tool only accepts PDF files. Images are not supported.", "warning");
        triggerWarningVisual();
        return true;
      } else {
        showToast("Images are not supported here and were skipped. Only PDF files were accepted.", "warning");
        onFiles(pdfFiles);
        return true;
      }
    }

    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length === 0 && files.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("Please choose a PDF file.", "error");
      triggerWarningVisual();
      return true;
    }

    if (pdfFiles.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      onFiles(pdfFiles);
      return true;
    }
  }

  if (types.isImageOnly) {
    const hasPdfs = files.some(isPdfFile);
    const imgFiles = files.filter(isImageFile);

    if (hasPdfs && imgFiles.length === 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("This tool only accepts image files (PNG, JPG). PDFs are not supported.", "warning");
      triggerWarningVisual();
      return true;
    }

    if (imgFiles.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (hasPdfs) {
        showToast("PDFs are not supported here and were skipped. Only image files were accepted.", "warning");
      }
      onFiles(imgFiles);
      return true;
    }

    if (files.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("Please add PNG or JPG images.", "error");
      triggerWarningVisual();
      return true;
    }
  }

  if (types.isTextOnly) {
    if (tryingToPasteImage) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("This tool only accepts text files. Images are not supported.", "warning");
      triggerWarningVisual();
      return true;
    }

    const hasPdfs = files.some(isPdfFile);
    if (hasPdfs) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("This tool only accepts text files. PDFs are not supported.", "warning");
      triggerWarningVisual();
      return true;
    }

    const textFiles = files.filter(isTextFile);
    if (textFiles.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      onFiles(textFiles);
      return true;
    }

    if (files.length > 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      showToast("Please choose a text file (.txt, .md, .csv, .log, .json).", "error");
      triggerWarningVisual();
      return true;
    }
  }

  // Mixed or general tools (e.g. merge-pdf)
  if (files.length > 0) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    onFiles(files);
    return true;
  }

  return false;
}

export function handlePasteEvent(e) {
  const target = getActivePasteTarget();
  if (!target) return;
  processClipboardPaste(e, target);
}

export function registerPasteHandler(fileInputEl, onFiles, dropZoneEl = null) {
  const target = { fileInputEl, onFiles, dropZoneEl };
  registeredPasteTargets.push(target);

  if (!globalPasteListenerBound && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("paste", handlePasteEvent);
    globalPasteListenerBound = true;
  }

  return () => {
    const idx = registeredPasteTargets.indexOf(target);
    if (idx !== -1) registeredPasteTargets.splice(idx, 1);
  };
}

export function resetPasteTargets() {
  registeredPasteTargets = [];
  globalPasteListenerBound = false;
}

export function initDropZone(dropZoneEl, fileInputEl, onFiles) {
  const handleFilesWithScroll = (files) => {
    const optionsBar = typeof document !== "undefined" && document.querySelector ? document.querySelector(".options-bar") : null;
    const previewArea = typeof document !== "undefined" && document.querySelector ? document.querySelector(".preview-area") : null;

    // Check if either area is already visible before we process the files
    const wasVisible =
      (optionsBar && optionsBar.classList && optionsBar.classList.contains("is-visible")) ||
      (previewArea && previewArea.classList && previewArea.classList.contains("is-visible"));

    onFiles(files);

    if (!wasVisible && typeof setTimeout === "function") {
      setTimeout(() => {
        if (typeof document === "undefined" || !document.querySelector) return;
        // Re-query in case they were dynamically created/altered
        const target = [
          document.querySelector(".options-bar"),
          document.querySelector(".preview-area"),
        ].find((el) => el && el.classList && el.classList.contains("is-visible"));
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
    }
  };

  if (dropZoneEl) {
    // Click on drop zone
    dropZoneEl.addEventListener("click", (e) => {
      if (
        (e.target.classList && e.target.classList.contains("dz-browse-btn")) ||
        e.target.tagName === "BUTTON" ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      ) {
        return; // handled elsewhere
      }
      if (fileInputEl && typeof fileInputEl.click === "function") {
        fileInputEl.click();
      }
    });

    const setDragState = (isDragging) => {
      if (isDragging) {
        dropZoneEl.classList.add("drag-over");
      } else {
        dropZoneEl.classList.remove("drag-over");
      }
    };

    // Drag events
    dropZoneEl.addEventListener("dragover", (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      setDragState(true);
    });

    dropZoneEl.addEventListener("dragleave", (e) => {
      if (!dropZoneEl.contains || !dropZoneEl.contains(e.relatedTarget)) {
        setDragState(false);
      }
    });

    dropZoneEl.addEventListener("drop", (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      setDragState(false);
      const files = Array.from(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
      if (files.length) handleFilesWithScroll(files);
    });
  }

  // File input change
  if (fileInputEl && typeof fileInputEl.addEventListener === "function") {
    fileInputEl.addEventListener("change", (e) => {
      if (e.target && e.target.files && e.target.files.length)
        handleFilesWithScroll(Array.from(e.target.files));
      // Reset so same file can be re-selected
      if (e.target) e.target.value = "";
    });
  }

  // Register for Ctrl+V document paste
  registerPasteHandler(fileInputEl, handleFilesWithScroll, dropZoneEl);
}

export function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

export function setProgress(barEl, labelEl, value, label) {
  barEl.style.width = `${value}%`;
  if (labelEl) labelEl.textContent = label;
}

export function activatePill(group, value) {
  if (!group) return;
  group.querySelectorAll(".opt-pill").forEach((p) => {
    const isActive = p.dataset.value === value;
    p.classList.toggle("active", isActive);
    if (p.hasAttribute && p.hasAttribute("aria-checked")) {
      p.setAttribute("aria-checked", isActive ? "true" : "false");
    }
  });
}

// ── Shared Drag Reorder Logic ──────────────────────────────
let dragSrcCard = null;
let initialTouchY = 0;
let initialTouchX = 0;
let lastTouchTarget = null;

export function setupDragReorder(card, onReorder) {
  setupTouchDragReorder(card, onReorder);
  setupMouseDragReorder(card, onReorder);
}

function setupTouchDragReorder(card, onReorder) {
  // Mobile touch support
  card.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest(".img-thumb-remove")) return;
      const currentCard = e.target.closest(".img-thumb-card");
      if (!currentCard) return;
      dragSrcCard = currentCard;
      const touch = e.touches[0];
      initialTouchX = touch.clientX;
      initialTouchY = touch.clientY;

      currentCard.classList.add("dragging");
      currentCard.style.zIndex = "1000";
    },
    { passive: false },
  );

  card.addEventListener(
    "touchmove",
    (e) => {
      if (!dragSrcCard) return;
      e.preventDefault();
      const touch = e.touches[0];

      const deltaX = touch.clientX - initialTouchX;
      const deltaY = touch.clientY - initialTouchY;
      dragSrcCard.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      dragSrcCard.style.visibility = "hidden";
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      dragSrcCard.style.visibility = "visible";

      const targetCard = target ? target.closest(".img-thumb-card") : null;

      if (targetCard && targetCard !== dragSrcCard) {
        if (lastTouchTarget && lastTouchTarget !== targetCard) {
          lastTouchTarget.classList.remove("drag-target");
        }
        targetCard.classList.add("drag-target");
        lastTouchTarget = targetCard;
      } else if (!targetCard && lastTouchTarget) {
        lastTouchTarget.classList.remove("drag-target");
        lastTouchTarget = null;
      }
    },
    { passive: false },
  );

  card.addEventListener(
    "touchend",
    (e) => {
      if (!dragSrcCard) return;
      dragSrcCard.classList.remove("dragging");
      dragSrcCard.style.transform = "";
      dragSrcCard.style.zIndex = "";

      if (lastTouchTarget) {
        lastTouchTarget.classList.remove("drag-target");
        handleDrop(lastTouchTarget, onReorder);
      }

      dragSrcCard = null;
      lastTouchTarget = null;
    },
    { passive: false },
  );
}

function setupMouseDragReorder(card, onReorder) {
  // Desktop drag support
  card.addEventListener("dragstart", (e) => {
    dragSrcCard = card;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    if (card.parentElement) {
      const active = card.parentElement.querySelector(".drag-target");
      if (active) active.classList.remove("drag-target");
    }
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!card.classList.contains("drag-target")) {
      const active = card.parentElement
        ? card.parentElement.querySelector(".drag-target")
        : null;
      if (active) active.classList.remove("drag-target");
      card.classList.add("drag-target");
    }
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    handleDrop(card, onReorder);
  });
}

function handleDrop(targetCard, onReorder) {
  if (!dragSrcCard || dragSrcCard === targetCard) return;

  const parent = targetCard.parentElement;
  if (!parent) return;

  const allCards = Array.from(parent.querySelectorAll(".img-thumb-card"));
  const srcIndex = allCards.indexOf(dragSrcCard);
  const targetIndex = allCards.indexOf(targetCard);

  if (srcIndex < targetIndex) {
    targetCard.after(dragSrcCard);
  } else {
    targetCard.before(dragSrcCard);
  }

  if (onReorder) {
    onReorder();
  }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function triggerDownload(url, filename, revokeUrl = false) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (revokeUrl) {
    setTimeout(() => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }, 100);
  }
}

export async function renderPageToDataUrl(page, viewport, imageType, imageQuality) {
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL(imageType, imageQuality);

  // Clean up canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

export async function renderPdfFirstPage(fileOrBuffer) {
  let pdfDoc = null;
  let page = null;
  try {
    const pdfjs = window["pdfjs-dist/build/pdf"];
    if (!pdfjs) return null;

    const arrayBuffer =
      fileOrBuffer instanceof ArrayBuffer
        ? fileOrBuffer
        : await fileOrBuffer.arrayBuffer();
    // Slice ArrayBuffer because PDF.js worker transfers and detaches buffers passed to getDocument
    pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
    if (pdfDoc.numPages < 1) return null;

    page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.3 });
    return await renderPageToDataUrl(page, viewport);
  } catch (err) {
    return null;
  } finally {
    if (page && typeof page.cleanup === "function") {
      page.cleanup();
    }
    if (pdfDoc && typeof pdfDoc.destroy === "function") {
      try {
        await pdfDoc.destroy();
      } catch (_) {
        // Ignore destruction errors
      }
    }
  }
}
