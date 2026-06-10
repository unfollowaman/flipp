import { initDropZone, showToast, setProgress } from './drag-drop.js';

let pdfDoc = null;
let pdfBytesOriginal = null;
let numPages = 0;
let currentPage = 1;
let pdfjsDocument = null;

let currentMode = 'draw';
let signaturePad = null;
let uploadedImageSrc = null;

const dropZone = document.getElementById('sign-drop-zone');
const fileInput = document.getElementById('sign-file-input');
const optionsBar = document.getElementById('sign-options');
const previewArea = document.getElementById('sign-preview-area');
const fileInfo = document.getElementById('sign-file-info');
const pageInfo = document.getElementById('sign-page-info');
const previewCanvas = document.getElementById('sign-preview-canvas');
const canvasContainer = document.getElementById('sign-canvas-container');
const loadingOverlay = document.getElementById('sign-loading-overlay');
const prevPageBtn = document.getElementById('sign-prev-page');
const nextPageBtn = document.getElementById('sign-next-page');

const modePills = document.querySelectorAll('#sign-mode-pills .opt-pill');
const drawControls = document.getElementById('sign-draw-controls');
const uploadControls = document.getElementById('sign-upload-controls');
const typeControls = document.getElementById('sign-type-controls');

const padCanvas = document.getElementById('sign-pad-canvas');
const clearBtn = document.getElementById('sign-clear-btn');

const imgDrop = document.getElementById('sign-img-drop');
const imgUpload = document.getElementById('sign-image-upload');
const imgPreview = document.getElementById('sign-image-preview');

const typeInput = document.getElementById('sign-type-input');
const fontSizeInput = document.getElementById('sign-font-size');
const fontSizeVal = document.getElementById('sign-font-size-val');
const typePreview = document.getElementById('sign-type-preview');
const typeCanvas = document.getElementById('sign-type-canvas');

const placeBtn = document.getElementById('sign-place-btn');
const downloadBtn = document.getElementById('sign-download-btn');
const downloadFinalBtn = document.getElementById('sign-download-final-btn');
const resetBtn = document.getElementById('sign-reset-btn');

const progressArea = document.getElementById('sign-progress');
const progressBar = document.getElementById('sign-progress-bar');
const progressLabel = document.getElementById('sign-progress-label');
const resultsArea = document.getElementById('sign-results');

const pdfjsLib = window['pdfjs-dist/build/pdf'];

// Init Signature Pad
function initSignaturePad() {
  if (signaturePad) return;

  // Resize canvas for sharp rendering
  const ratio =  Math.max(window.devicePixelRatio || 1, 1);
  padCanvas.width = padCanvas.offsetWidth * ratio;
  padCanvas.height = padCanvas.offsetHeight * ratio;
  padCanvas.getContext("2d").scale(ratio, ratio);

  signaturePad = new window.SignaturePad(padCanvas, {
    minWidth: 1,
    maxWidth: 3,
    penColor: "rgb(0, 0, 0)"
  });
}

// Mode Switching
modePills.forEach(pill => {
  pill.addEventListener('click', () => {
    modePills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentMode = pill.dataset.value;

    drawControls.style.display = 'none';
    uploadControls.style.display = 'none';
    typeControls.style.display = 'none';

    if (currentMode === 'draw') {
      drawControls.style.display = 'flex';
      initSignaturePad();
    } else if (currentMode === 'upload') {
      uploadControls.style.display = 'flex';
    } else if (currentMode === 'type') {
      typeControls.style.display = 'flex';
    }
  });
});

clearBtn.addEventListener('click', () => {
  if (signaturePad) signaturePad.clear();
});

// Upload Mode
initDropZone(imgDrop, imgUpload, handleImageSelect);

function handleImageSelect(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file (PNG/JPG).', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageSrc = e.target.result;
    imgPreview.src = uploadedImageSrc;
    imgPreview.style.display = 'block';
    imgDrop.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

imgPreview.addEventListener('click', () => {
  imgUpload.click();
});

// Type Mode
function updateTypePreview() {
  const text = typeInput.value || 'Your Name';
  const size = fontSizeInput.value;
  fontSizeVal.textContent = size;
  typePreview.style.fontSize = size + 'px';
  typePreview.textContent = text;
}

typeInput.addEventListener('input', updateTypePreview);
fontSizeInput.addEventListener('input', updateTypePreview);

function getTypedSignatureAsBase64() {
  const text = typeInput.value || 'Your Name';
  const size = parseInt(fontSizeInput.value, 10);

  const ctx = typeCanvas.getContext('2d');
  ctx.font = `${size}px "Dancing Script"`;
  const metrics = ctx.measureText(text);

  const width = Math.ceil(metrics.width) + 20;
  const height = size * 1.5;

  typeCanvas.width = width;
  typeCanvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.font = `${size}px "Dancing Script"`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height / 2);

  return typeCanvas.toDataURL('image/png');
}

// PDF Upload & Rendering
initDropZone(dropZone, fileInput, handlePdfSelect);

async function handlePdfSelect(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (file.type !== 'application/pdf') {
    showToast('Please select a valid PDF file.', 'error');
    return;
  }

  fileInfo.textContent = file.name;
  dropZone.style.display = 'none';
  optionsBar.style.display = 'block';
  previewArea.style.display = 'block';

  const arrayBuffer = await file.arrayBuffer();
  pdfBytesOriginal = arrayBuffer;

  // Create a copy of the array buffer for pdf.js so it doesn't detach the original
  const pdfjsBuffer = arrayBuffer.slice(0);

  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfjsBuffer });
    pdfjsDocument = await loadingTask.promise;
    numPages = pdfjsDocument.numPages;
    currentPage = 1;

    initSignaturePad();
    renderPage(currentPage);
  } catch (err) {
    console.error(err);
    showToast('Error loading PDF.', 'error');
    resetTool();
  }
}

async function renderPage(pageNum) {
  loadingOverlay.style.display = 'flex';
  pageInfo.textContent = `Page ${pageNum} of ${numPages}`;

  prevPageBtn.disabled = pageNum <= 1;
  nextPageBtn.disabled = pageNum >= numPages;

  try {
    const page = await pdfjsDocument.getPage(pageNum);
    const containerWidth = canvasContainer.clientWidth || 800;

    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    const renderContext = {
      canvasContext: previewCanvas.getContext('2d'),
      viewport: viewport
    };

    await page.render(renderContext).promise;
  } catch (err) {
    console.error(err);
    showToast('Error rendering page preview.', 'error');
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < numPages) {
    currentPage++;
    renderPage(currentPage);
  }
});

// Signature Overlay Logic
let overlayIdCounter = 0;

placeBtn.addEventListener('click', () => {
  let imgSrc = null;

  if (currentMode === 'draw') {
    if (signaturePad && !signaturePad.isEmpty()) {
      imgSrc = signaturePad.toDataURL('image/png');
    } else {
      showToast('Please draw a signature first.', 'error');
      return;
    }
  } else if (currentMode === 'upload') {
    if (uploadedImageSrc) {
      imgSrc = uploadedImageSrc;
    } else {
      showToast('Please upload an image first.', 'error');
      return;
    }
  } else if (currentMode === 'type') {
    if (typeInput.value.trim() === '') {
      showToast('Please type your name.', 'error');
      return;
    }
    imgSrc = getTypedSignatureAsBase64();
  }

  if (imgSrc) {
    createSignatureOverlay(imgSrc);
    optionsBar.scrollIntoView({ behavior: 'smooth' });
  }
});

function createSignatureOverlay(src) {
  const overlay = document.createElement('div');
  overlay.className = 'signature-overlay';
  overlay.dataset.id = `sig-${overlayIdCounter++}`;
  overlay.dataset.page = currentPage; // Remember which page it was placed on

  const img = document.createElement('img');
  img.src = src;

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';

  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'delete-handle';
  deleteBtn.innerHTML = '✕';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.remove();
  });

  overlay.appendChild(img);
  overlay.appendChild(resizeHandle);
  overlay.appendChild(deleteBtn);

  canvasContainer.appendChild(overlay);

  // Set initial position
  img.onload = () => {
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    // Scale down if too big
    const maxW = previewCanvas.offsetWidth * 0.5;
    if (w > maxW) {
      const ratio = maxW / w;
      w = maxW;
      h = h * ratio;
    }

    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;

    // Center initially
    const cW = previewCanvas.offsetWidth;
    const cH = previewCanvas.offsetHeight;
    overlay.style.left = `${(cW - w) / 2}px`;
    overlay.style.top = `${(cH - h) / 2}px`;
  };

  makeDraggableAndResizable(overlay, resizeHandle);
}

function makeDraggableAndResizable(overlay, resizeHandle) {
  let isDragging = false;
  let isResizing = false;
  let startX, startY;
  let startLeft, startTop;
  let startWidth, startHeight;

  // Dragging
  overlay.addEventListener('mousedown', startDrag);
  overlay.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    if (e.target === resizeHandle || e.target.classList.contains('delete-handle')) return;

    isDragging = true;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    startX = clientX;
    startY = clientY;
    startLeft = parseInt(overlay.style.left || 0, 10);
    startTop = parseInt(overlay.style.top || 0, 10);

    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    if (e.type.includes('touch')) e.preventDefault();
  }

  function drag(e) {
    if (!isDragging) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // Constrain to container
    const cW = canvasContainer.offsetWidth;
    const cH = canvasContainer.offsetHeight;
    const oW = overlay.offsetWidth;
    const oH = overlay.offsetHeight;

    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft + oW > cW) newLeft = cW - oW;
    if (newTop + oH > cH) newTop = cH - oH;

    overlay.style.left = `${newLeft}px`;
    overlay.style.top = `${newTop}px`;

    if (e.type.includes('touch')) e.preventDefault();
  }

  function endDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
  }

  // Resizing
  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('touchstart', startResize, { passive: false });

  function startResize(e) {
    isResizing = true;
    e.stopPropagation();

    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    startX = clientX;
    startY = clientY;
    startWidth = overlay.offsetWidth;
    startHeight = overlay.offsetHeight;

    document.addEventListener('mousemove', resize);
    document.addEventListener('touchmove', resize, { passive: false });
    document.addEventListener('mouseup', endResize);
    document.addEventListener('touchend', endResize);

    if (e.type.includes('touch')) e.preventDefault();
  }

  function resize(e) {
    if (!isResizing) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    // Maintain aspect ratio based on width change
    const ratio = startHeight / startWidth;
    let newWidth = Math.max(30, startWidth + dx);
    let newHeight = newWidth * ratio;

    overlay.style.width = `${newWidth}px`;
    overlay.style.height = `${newHeight}px`;

    if (e.type.includes('touch')) e.preventDefault();
  }

  function endResize() {
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('touchmove', resize);
    document.removeEventListener('mouseup', endResize);
    document.removeEventListener('touchend', endResize);
  }
}

// Ensure overlays are only visible on their respective pages
const observer = new MutationObserver(() => {
  const overlays = document.querySelectorAll('.signature-overlay');
  overlays.forEach(overlay => {
    const page = parseInt(overlay.dataset.page, 10);
    if (page === currentPage) {
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }
  });
});
observer.observe(pageInfo, { childList: true, characterData: true, subtree: true });
// Also trigger on manual change just in case
prevPageBtn.addEventListener('click', updateOverlayVisibility);
nextPageBtn.addEventListener('click', updateOverlayVisibility);

function updateOverlayVisibility() {
  const overlays = document.querySelectorAll('.signature-overlay');
  overlays.forEach(overlay => {
    const page = parseInt(overlay.dataset.page, 10);
    if (page === currentPage) {
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }
  });
}

// Download Process
downloadBtn.addEventListener('click', async () => {
  const overlays = document.querySelectorAll('.signature-overlay');
  if (overlays.length === 0) {
    showToast('Please place at least one signature on the PDF.', 'error');
    return;
  }

  // Pre-calculate dimensions before hiding the preview area
  const canvasW = previewCanvas.offsetWidth;
  const canvasH = previewCanvas.offsetHeight;

  const overlayData = Array.from(overlays).map(overlay => {
    return {
      pageNum: parseInt(overlay.dataset.page, 10),
      src: overlay.querySelector('img').src,
      oLeft: parseFloat(overlay.style.left) || 0,
      oTop: parseFloat(overlay.style.top) || 0,
      oWidth: overlay.offsetWidth,
      oHeight: overlay.offsetHeight
    };
  });

  optionsBar.style.display = 'none';
  previewArea.style.display = 'none';
  progressArea.style.display = 'flex';
  setProgress(progressBar, progressLabel, 10, 'Loading PDF...');

  try {
    const { PDFDocument } = window.PDFLib;
    // Load fresh from original bytes
    const pdfDoc = await PDFDocument.load(pdfBytesOriginal);
    const pages = pdfDoc.getPages();

    setProgress(progressBar, progressLabel, 40, 'Embedding signatures...');

    // We need to embed each image. We cache by src to avoid embedding the same image multiple times
    const embeddedImages = new Map();

    for (let i = 0; i < overlayData.length; i++) {
      const data = overlayData[i];
      if (data.pageNum < 1 || data.pageNum > pages.length) continue;

      const targetPage = pages[data.pageNum - 1];
      const src = data.src;

      let pdfImage;
      if (embeddedImages.has(src)) {
        pdfImage = embeddedImages.get(src);
      } else {
        // Embed image based on type
        if (src.startsWith('data:image/jpeg')) {
          pdfImage = await pdfDoc.embedJpg(src);
        } else {
          pdfImage = await pdfDoc.embedPng(src);
        }
        embeddedImages.set(src, pdfImage);
      }

      // Calculate coordinates
      // HTML canvas size vs PDF page size
      // We must render the page at scale 1 to get its actual PDF points size to find the ratio correctly,
      // but actually pdf.js page.getViewport({ scale: 1 }) width is closely matching targetPage.getWidth().

      const pdfW = targetPage.getWidth();
      const pdfH = targetPage.getHeight();

      const scaleX = pdfW / canvasW;
      const scaleY = pdfH / canvasH;

      const drawW = data.oWidth * scaleX;
      const drawH = data.oHeight * scaleY;
      const drawX = data.oLeft * scaleX;

      // PDF y-axis is inverted (0 is bottom)
      const drawY = pdfH - (data.oTop * scaleY) - drawH;

      targetPage.drawImage(pdfImage, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });

      setProgress(progressBar, progressLabel, 40 + Math.floor((i/overlayData.length)*40), `Applying signature ${i+1}/${overlayData.length}...`);
    }

    setProgress(progressBar, progressLabel, 85, 'Saving PDF...');
    const modifiedPdfBytes = await pdfDoc.save();

    setProgress(progressBar, progressLabel, 100, 'Done!');
    setTimeout(() => {
      progressArea.style.display = 'none';
      resultsArea.style.display = 'flex';

      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      downloadFinalBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        const safeName = fileInfo.textContent.replace('.pdf', '').replace(/[\/\\]/g, '_');
        a.download = `${safeName}_signed.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

    }, 500);

  } catch (err) {
    console.error(err);
    showToast('An error occurred while saving the PDF.', 'error');
    progressArea.style.display = 'none';
    optionsBar.style.display = 'block';
    previewArea.style.display = 'block';
  }
});

function resetTool() {
  pdfBytesOriginal = null;
  pdfjsDocument = null;
  uploadedImageSrc = null;
  if (signaturePad) signaturePad.clear();

  document.querySelectorAll('.signature-overlay').forEach(el => el.remove());

  imgPreview.src = '';
  imgPreview.style.display = 'none';
  imgDrop.style.display = 'flex';
  typeInput.value = '';
  updateTypePreview();

  dropZone.style.display = 'flex';
  optionsBar.style.display = 'none';
  previewArea.style.display = 'none';
  progressArea.style.display = 'none';
  resultsArea.style.display = 'none';
  fileInput.value = '';
}

resetBtn.addEventListener('click', resetTool);
