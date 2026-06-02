import { initDropZone, showToast, setProgress, activatePill } from './drag-drop.js';

let currentPdfBuffer = null;
let currentPdfDoc = null; // pdf.js document
let firstPageRenderContext = null; // store render info to re-render watermark
let uploadedImageURL = null;

const dropZone = document.getElementById('wm-drop-zone');
const fileInput = document.getElementById('wm-file-input');
const optionsBar = document.getElementById('wm-options');
const previewArea = document.getElementById('wm-preview-area');
const progressArea = document.getElementById('wm-progress');
const progressBar = document.getElementById('wm-progress-bar');
const progressLabel = document.getElementById('wm-progress-label');
const resultsArea = document.getElementById('wm-results');
const fileInfo = document.getElementById('wm-file-info');
const previewCanvas = document.getElementById('wm-preview-canvas');
const ctx = previewCanvas.getContext('2d');
const convertBtn = document.getElementById('wm-convert-btn');
const downloadBtn = document.getElementById('wm-download-btn');
const resetBtn = document.getElementById('wm-reset-btn');
const loadingOverlay = document.getElementById('wm-loading-overlay');

// UI Controls
const modePills = document.querySelectorAll('#wm-mode-pills .opt-pill');
const textControls = document.getElementById('wm-text-controls');
const imageControls = document.getElementById('wm-image-controls');

// Settings Inputs
const textInput = document.getElementById('wm-text-input');
const fontSizeInput = document.getElementById('wm-font-size');
const colorInput = document.getElementById('wm-color');

const imageUpload = document.getElementById('wm-image-upload');
const imagePreview = document.getElementById('wm-image-preview');
const scaleInput = document.getElementById('wm-scale');

const opacityInput = document.getElementById('wm-opacity');
const rotationInput = document.getElementById('wm-rotation');
const positionSelect = document.getElementById('wm-position');

// Display values
const fontSizeVal = document.getElementById('wm-font-size-val');
const scaleVal = document.getElementById('wm-scale-val');
const opacityVal = document.getElementById('wm-opacity-val');
const rotationVal = document.getElementById('wm-rotation-val');

let fileName = 'document.pdf';
let currentMode = 'text';

// Initialize
initDropZone(dropZone, fileInput, handleFile);

// Update value displays
fontSizeInput.addEventListener('input', (e) => { fontSizeVal.textContent = e.target.value; schedulePreviewUpdate(); });
scaleInput.addEventListener('input', (e) => { scaleVal.textContent = parseFloat(e.target.value).toFixed(1); schedulePreviewUpdate(); });
opacityInput.addEventListener('input', (e) => { opacityVal.textContent = e.target.value; schedulePreviewUpdate(); });
rotationInput.addEventListener('input', (e) => { rotationVal.textContent = e.target.value; schedulePreviewUpdate(); });

textInput.addEventListener('input', schedulePreviewUpdate);
colorInput.addEventListener('input', schedulePreviewUpdate);
positionSelect.addEventListener('change', schedulePreviewUpdate);

// Mode Switching
modePills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    activatePill(e.target.parentElement, e.target.dataset.value);
    currentMode = e.target.dataset.value;
    if (currentMode === 'text') {
      textControls.style.display = 'flex';
      imageControls.style.display = 'none';
    } else {
      textControls.style.display = 'none';
      imageControls.style.display = 'flex';
    }
    schedulePreviewUpdate();
  });
});

// Image Upload Handling
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImageURL = event.target.result;
      imagePreview.src = uploadedImageURL;
      imagePreview.style.display = 'block';
      schedulePreviewUpdate();
    };
    reader.readAsDataURL(file);
  }
});

let previewTimeout = null;
function schedulePreviewUpdate() {
  if (!currentPdfDoc) return;
  if (previewTimeout) clearTimeout(previewTimeout);
  previewTimeout = setTimeout(renderPreview, 100);
}

async function handleFile(files) {
  if (files.length === 0) return;
  const file = files[0];
  if (file.type !== 'application/pdf') {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  fileName = file.name;
  dropZone.style.display = 'none';
  optionsBar.style.display = 'flex';
  previewArea.style.display = 'block';
  fileInfo.textContent = `Loading ${fileName}...`;

  try {
    currentPdfBuffer = await file.arrayBuffer();
    // Copy buffer for pdf.js to avoid detaching it from pdf-lib later
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    currentPdfDoc = await pdfjsLib.getDocument({ data: currentPdfBuffer.slice(0) }).promise;

    fileInfo.textContent = `${fileName} (${currentPdfDoc.numPages} pages)`;

    await setupFirstPagePreview();

  } catch (err) {
    console.error(err);
    showToast('Error loading PDF.', 'error');
    resetApp();
  }
}

async function setupFirstPagePreview() {
  try {
    loadingOverlay.style.display = 'flex';
    const page = await currentPdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // High res for preview

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    firstPageRenderContext = {
      canvasContext: ctx,
      viewport: viewport,
      page: page
    };

    await renderPreview();

  } catch (err) {
    console.error('Error rendering first page', err);
  }
}

async function renderPreview() {
  if (!firstPageRenderContext) return;
  loadingOverlay.style.display = 'flex';

  const { page, viewport, canvasContext } = firstPageRenderContext;

  // 1. Render PDF base layer
  await page.render({ canvasContext, viewport }).promise;

  // 2. Render Watermark overlay
  drawWatermarkOnCanvas(canvasContext, viewport.width, viewport.height);

  loadingOverlay.style.display = 'none';
}

function drawWatermarkOnCanvas(ctx, width, height) {
  ctx.save();

  const opacity = parseInt(opacityInput.value) / 100;
  const rotation = parseInt(rotationInput.value) * (Math.PI / 180);
  const position = positionSelect.value;

  ctx.globalAlpha = opacity;

  if (currentMode === 'text') {
    drawTextWatermarkOnCanvas(ctx, width, height, position, rotation);
  } else {
    drawImageWatermarkOnCanvas(ctx, width, height, position, rotation);
  }

  ctx.restore();
}

function drawTextWatermarkOnCanvas(ctx, width, height, position, rotation) {
  const text = textInput.value;
  if (!text) return;

  const fontSize = parseInt(fontSizeInput.value) * 1.5; // Scale up for canvas viewport
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = colorInput.value;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize; // rough estimation

  applyWatermarkPattern(position, width, height, textWidth, textHeight, 100, 100, getPositionCoordinates, (x, y) => {
     drawTextAt(ctx, text, x, y, rotation, textWidth, textHeight);
  });
}

function drawImageWatermarkOnCanvas(ctx, width, height, position, rotation) {
  if (!uploadedImageURL) return;
  const img = document.getElementById('wm-image-preview');
  if (!img.complete || img.naturalWidth === 0) return;

  const scale = parseFloat(scaleInput.value);
  const imgWidth = img.naturalWidth * scale;
  const imgHeight = img.naturalHeight * scale;

  applyWatermarkPattern(position, width, height, imgWidth, imgHeight, 50, 50, getPositionCoordinates, (x, y) => {
     drawImageAt(ctx, img, x, y, rotation, imgWidth, imgHeight);
  });
}

function applyWatermarkPattern(position, width, height, itemW, itemH, padX, padY, getCoordsFn, drawFn) {
  if (position === 'tile') {
    const stepX = itemW + padX;
    const stepY = itemH + padY;
    for(let x = -width; x < width * 2; x += stepX) {
      for(let y = -height; y < height * 2; y += stepY) {
         drawFn(x, y);
      }
    }
  } else {
     const {x, y} = getCoordsFn(position, width, height, itemW, itemH);
     drawFn(x, y);
  }
}

function getPositionCoordinates(position, canvasW, canvasH, itemW, itemH) {
  const padding = 20;
  let x = 0, y = 0;

  // Base coordinates without rotation adjustment (centered on item)
  switch(position) {
    case 'center':
      x = canvasW / 2;
      y = canvasH / 2;
      break;
    case 'top-left':
      x = padding + itemW/2;
      y = padding + itemH/2;
      break;
    case 'top-right':
      x = canvasW - padding - itemW/2;
      y = padding + itemH/2;
      break;
    case 'bottom-left':
      x = padding + itemW/2;
      y = canvasH - padding - itemH/2;
      break;
    case 'bottom-right':
      x = canvasW - padding - itemW/2;
      y = canvasH - padding - itemH/2;
      break;
  }
  return {x, y};
}

function drawTextAt(ctx, text, x, y, rotation, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawImageAt(ctx, img, x, y, rotation, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
}


// --- PDF Generation using pdf-lib ---

let processedPdfBytes = null;

convertBtn.addEventListener('click', async () => {
  if (!currentPdfBuffer) return;

  if (currentMode === 'image' && !uploadedImageURL) {
    showToast('Please upload an image for the watermark.', 'error');
    return;
  }

  optionsBar.style.display = 'none';
  previewArea.style.display = 'none';
  progressArea.style.display = 'block';

  try {
    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib;

    const pdfDoc = await PDFDocument.load(currentPdfBuffer);
    const pages = pdfDoc.getPages();
    const numPages = pages.length;

    // Parse settings
    const opacity = parseInt(opacityInput.value) / 100;
    const rotationDeg = parseInt(rotationInput.value);
    const rotation = degrees(-rotationDeg); // PDF-lib rotation is counter-clockwise, HTML canvas is clockwise.
    const position = positionSelect.value;

    let font, hexColor, pdfColor, wmImage, imageDims;
    const scale = parseFloat(scaleInput.value);

    if (currentMode === 'text') {
       font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
       hexColor = colorInput.value;
       const r = parseInt(hexColor.slice(1,3), 16) / 255;
       const g = parseInt(hexColor.slice(3,5), 16) / 255;
       const b = parseInt(hexColor.slice(5,7), 16) / 255;
       pdfColor = rgb(r, g, b);
    } else {
       // Embed image
       if (uploadedImageURL.startsWith('data:image/png')) {
         wmImage = await pdfDoc.embedPng(uploadedImageURL);
       } else if (uploadedImageURL.startsWith('data:image/jpeg') || uploadedImageURL.startsWith('data:image/jpg')) {
         wmImage = await pdfDoc.embedJpg(uploadedImageURL);
       } else {
          throw new Error('Unsupported image format');
       }
       imageDims = wmImage.scale(scale);
    }

    for (let i = 0; i < numPages; i++) {
      setProgress(progressBar, progressLabel, ((i) / numPages) * 100, `Applying watermark to page ${i + 1} of ${numPages}...`);

      const page = pages[i];
      const { width, height } = page.getSize();

      if (currentMode === 'text') {
         const text = textInput.value;
         if (!text) continue;
         const fontSize = parseInt(fontSizeInput.value);
         const textWidth = font.widthOfTextAtSize(text, fontSize);
         const textHeight = font.heightAtSize(fontSize);

         applyWatermarkPattern(position, width, height, textWidth, textHeight, 100, 100, getPdfCoordinates, (x, y) => {
            const { dx, dy } = getPdfPositionOffset(x, y, textWidth, textHeight, rotationDeg);
            page.drawText(text, {
               x: dx,
               y: dy,
               size: fontSize,
               font: font,
               color: pdfColor,
               opacity: opacity,
               rotate: rotation,
            });
         });
      } else {
         if (!wmImage) continue;
         const imgW = imageDims.width;
         const imgH = imageDims.height;

         applyWatermarkPattern(position, width, height, imgW, imgH, 50, 50, getPdfCoordinates, (x, y) => {
            const { dx, dy } = getPdfPositionOffset(x, y, imgW, imgH, rotationDeg);
            page.drawImage(wmImage, {
               x: dx,
               y: dy,
               width: imgW,
               height: imgH,
               opacity: opacity,
               rotate: rotation,
            });
         });
      }

      // small delay to let UI update
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    setProgress(progressBar, progressLabel, 100, 'Saving PDF...');
    await new Promise(r => setTimeout(r, 0)); // allow UI to paint

    processedPdfBytes = await pdfDoc.save();

    progressArea.style.display = 'none';
    resultsArea.style.display = 'block';

  } catch (err) {
    console.error('Error applying watermark:', err);
    showToast('An error occurred applying the watermark.', 'error');
    resetApp();
  }
});


// Helper for PDF coordinates (origin is bottom-left in PDF, canvas is top-left)
function getPdfCoordinates(position, width, height, itemW, itemH) {
  const padding = 20;
  let x = 0, y = 0;

  switch(position) {
    case 'center':
      x = width / 2;
      y = height / 2;
      break;
    case 'top-left':
      x = padding + itemW/2;
      y = height - padding - itemH/2;
      break;
    case 'top-right':
      x = width - padding - itemW/2;
      y = height - padding - itemH/2;
      break;
    case 'bottom-left':
      x = padding + itemW/2;
      y = padding + itemH/2;
      break;
    case 'bottom-right':
      x = width - padding - itemW/2;
      y = padding + itemH/2;
      break;
  }
  return {x, y};
}

// PDF-lib rotation pivots around the bottom-left of the drawn item.
// We want it to pivot around the center.
// This function calculates the offset needed to achieve center-pivoted rotation.
function getPdfPositionOffset(cx, cy, itemW, itemH, rotationDeg) {
  const rad = rotationDeg * (Math.PI / 180);
  // Distance from center to bottom-left corner of unrotated item
  const dx0 = -itemW / 2;
  const dy0 = -itemH / 2;

  // Rotate this vector
  // Note: PDF-lib rotates counter-clockwise.
  // We want positive rotationDeg to mean clockwise visually (as in canvas),
  // which means counter-clockwise in pdf coordinates (since Y is up).
  // Wait, if Y is up, standard rotation matrix is CCW.
  // Canvas: Y down, positive rotation is CW.
  // PDF: Y up, positive rotation (pdf-lib degrees(-rot)) is CW.
  // Let's use the negative rotation angle for the vector transformation
  // since we pass degrees(-rot) to pdf-lib.
  const angle = -rad;
  const dxRot = dx0 * Math.cos(angle) - dy0 * Math.sin(angle);
  const dyRot = dx0 * Math.sin(angle) + dy0 * Math.cos(angle);

  return {
    dx: cx + dxRot,
    dy: cy + dyRot
  };
}

downloadBtn.addEventListener('click', () => {
  if (!processedPdfBytes) return;
  const blob = new Blob([processedPdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace('.pdf', '-watermarked.pdf');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener('click', resetApp);

function resetApp() {
  currentPdfBuffer = null;
  currentPdfDoc = null;
  firstPageRenderContext = null;
  processedPdfBytes = null;
  fileName = '';

  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  dropZone.style.display = 'block';
  optionsBar.style.display = 'none';
  previewArea.style.display = 'none';
  progressArea.style.display = 'none';
  resultsArea.style.display = 'none';

  fileInput.value = '';
}
