// img-to-pdf.js — PNG/JPG → PDF conversion using jsPDF

import { initDropZone, showToast, setProgress } from './drag-drop.js';

// ── State ──────────────────────────────────────────────
let imageFiles   = []; // { file, objectUrl, name }
let pdfBlob      = null;
let pageSize     = 'auto';
let orientation  = 'portrait';

// ── DOM refs ───────────────────────────────────────────
const dropZoneEl    = document.getElementById('img-drop-zone');
const fileInputEl   = document.getElementById('img-file-input');

const optionsEl     = document.getElementById('img-options');
const sizePills     = document.getElementById('img-size-pills');
const orientPills   = document.getElementById('img-orient-pills');
const filenameInput = document.getElementById('img-filename-input');

const previewArea   = document.getElementById('img-preview-area');
const fileCountEl   = document.getElementById('img-file-count');
const addMoreBtn    = document.getElementById('img-add-more-btn');
const convertBtn    = document.getElementById('img-convert-btn');
const previewGrid   = document.getElementById('img-preview-grid');

const progressArea  = document.getElementById('img-progress');
const progressBar   = document.getElementById('img-progress-bar');
const progressLabel = document.getElementById('img-progress-label');

const resultsArea   = document.getElementById('img-results');
const downloadBtn   = document.getElementById('img-download-btn');
const resultInfo    = document.getElementById('img-result-info');
const resetBtn      = document.getElementById('img-reset-btn');

// ── Pill helpers ────────────────────────────────────────
function activatePill(group, value) {
  group.querySelectorAll('.opt-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === value);
  });
}

sizePills.addEventListener('click', (e) => {
  const pill = e.target.closest('.opt-pill');
  if (!pill) return;
  pageSize = pill.dataset.value;
  activatePill(sizePills, pill.dataset.value);
});

orientPills.addEventListener('click', (e) => {
  const pill = e.target.closest('.opt-pill');
  if (!pill) return;
  orientation = pill.dataset.value;
  activatePill(orientPills, pill.dataset.value);
});

// ── Add files ───────────────────────────────────────────
function addImageFiles(files) {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
  const valid   = files.filter(f => allowed.includes(f.type) || /\.(png|jpe?g)$/i.test(f.name));

  if (!valid.length) {
    showToast('Please add PNG or JPG images.', 'error');
    return;
  }

  for (const file of valid) {
    imageFiles.push({
      file,
      objectUrl: URL.createObjectURL(file),
      name: file.name,
      id: Date.now() + Math.random()
    });
  }

  showPreview();
}

// ── Render preview grid ─────────────────────────────────
function showPreview() {
  optionsEl.style.display    = 'flex';
  previewArea.style.display  = 'block';
  progressArea.style.display = 'none';
  resultsArea.style.display  = 'none';
  renderPreviewGrid();
}

function renderPreviewGrid() {
  previewGrid.innerHTML = '';
  fileCountEl.textContent = `${imageFiles.length} image${imageFiles.length !== 1 ? 's' : ''} selected`;

  imageFiles.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className    = 'img-thumb-card';
    card.draggable    = true;
    card.dataset.idx  = idx;

    const num = document.createElement('div');
    num.className   = 'img-thumb-num';
    num.textContent = idx + 1;
    card.appendChild(num);

    const img = document.createElement('img');
    img.src     = entry.objectUrl;
    img.loading = 'lazy';
    img.alt     = entry.name;
    card.appendChild(img);

    const lbl = document.createElement('div');
    lbl.className   = 'img-thumb-label';
    lbl.textContent = entry.name;
    card.appendChild(lbl);

    const rmBtn = document.createElement('button');
    rmBtn.className   = 'img-thumb-remove';
    rmBtn.textContent = '×';
    rmBtn.title = `Remove ${entry.name}`;
    rmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(entry.objectUrl);
      imageFiles.splice(idx, 1);
      if (imageFiles.length === 0) {
        resetImgConverter();
      } else {
        renderPreviewGrid();
      }
    });
    card.appendChild(rmBtn);

    // Drag to reorder
    setupDragReorder(card, idx);

    previewGrid.appendChild(card);
  });
}

// ── Drag-to-reorder ─────────────────────────────────────
let dragSrcIdx = null;

function setupDragReorder(card, idx) {
  card.addEventListener('dragstart', (e) => {
    dragSrcIdx = idx;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    previewGrid.querySelectorAll('.img-thumb-card').forEach(c => {
      c.classList.remove('drag-target');
    });
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    previewGrid.querySelectorAll('.img-thumb-card').forEach(c => c.classList.remove('drag-target'));
    card.classList.add('drag-target');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragSrcIdx === null || dragSrcIdx === idx) return;
    const moved = imageFiles.splice(dragSrcIdx, 1)[0];
    imageFiles.splice(idx, 0, moved);
    dragSrcIdx = null;
    renderPreviewGrid();
  });
}

// ── Add more images button ──────────────────────────────
addMoreBtn.addEventListener('click', () => fileInputEl.click());

// ── Wait for jsPDF ─────────────────────────────────────
function getJsPDF() {
  return window.jspdf?.jsPDF || window.jsPDF;
}

async function waitForJsPDF() {
  return new Promise((resolve) => {
    const check = () => {
      const lib = getJsPDF();
      if (lib) resolve(lib);
      else setTimeout(check, 150);
    };
    check();
  });
}

// ── Get image dimensions ────────────────────────────────
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}

// ── File to base64 ──────────────────────────────────────
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Convert images → PDF ────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (!imageFiles.length) return;

  previewArea.style.display  = 'none';
  optionsEl.style.display    = 'none';
  progressArea.style.display = 'block';
  resultsArea.style.display  = 'none';

  setProgress(progressBar, progressLabel, 0, 'Loading jsPDF…');

  const jsPDF = await waitForJsPDF();

  // Page dimensions in mm (jsPDF uses mm)
  // a4: 210×297, letter: 215.9×279.4
  const pageSizes = {
    a4:     [210, 297],
    letter: [215.9, 279.4],
  };

  let pdf = null;
  let totalPagesAdded = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const entry = imageFiles[i];
    setProgress(
      progressBar, progressLabel,
      Math.round(((i) / imageFiles.length) * 100),
      `Processing image ${i + 1} of ${imageFiles.length}: ${entry.name}`
    );

    const dataUrl = await fileToDataUrl(entry.file);
    const { w: imgW, h: imgH } = await getImageDimensions(dataUrl);

    // Determine format string for jsPDF
    const imgFormat = entry.file.type === 'image/png' ? 'PNG' : 'JPEG';

    let docW, docH;
    if (pageSize === 'auto') {
      // Convert pixels to mm (assume 96dpi: 1px = 0.264583mm)
      docW = imgW * 0.264583;
      docH = imgH * 0.264583;
    } else {
      [docW, docH] = pageSizes[pageSize];
      if (orientation === 'landscape') [docW, docH] = [docH, docW];
    }

    if (!pdf) {
      pdf = new jsPDF({
        orientation: docW > docH ? 'landscape' : 'portrait',
        unit: 'mm',
        format: pageSize === 'auto' ? [docW, docH] : pageSize,
      });
    } else {
      pdf.addPage(
        pageSize === 'auto' ? [docW, docH] : pageSize,
        docW > docH ? 'landscape' : 'portrait'
      );
    }

    // Fit image to page with margins if using standard page size
    let imgX = 0, imgY = 0, drawW = docW, drawH = docH;

    if (pageSize !== 'auto') {
      const margin = 10; // mm
      const usableW = docW - margin * 2;
      const usableH = docH - margin * 2;
      const ratio   = Math.min(usableW / imgW, usableH / imgH);
      drawW = imgW * ratio;
      drawH = imgH * ratio;
      imgX  = margin + (usableW - drawW) / 2;
      imgY  = margin + (usableH - drawH) / 2;
    }

    pdf.addImage(dataUrl, imgFormat, imgX, imgY, drawW, drawH, undefined, 'FAST');
    totalPagesAdded++;

    await new Promise(r => setTimeout(r, 0));
  }

  setProgress(progressBar, progressLabel, 100, 'Finalising PDF…');
  await new Promise(r => setTimeout(r, 200));

  pdfBlob = pdf.output('blob');

  progressArea.style.display = 'none';
  showResults(totalPagesAdded);
});

// ── Show results ────────────────────────────────────────
function showResults(pageCount) {
  resultsArea.style.display = 'block';

  const sizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
  resultInfo.innerHTML = `
    <strong>Pages:</strong> ${pageCount}<br/>
    <strong>File size:</strong> ${sizeMB} MB<br/>
    <strong>Filename:</strong> ${filenameInput.value || 'converted.pdf'}
  `;

  showToast(`✓ PDF built with ${pageCount} page${pageCount !== 1 ? 's' : ''}!`);
}

// ── Download PDF ────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!pdfBlob) return;
  const filename = filenameInput.value.trim() || 'converted.pdf';
  const url = URL.createObjectURL(pdfBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename.endsWith('.pdf') ? filename : filename + '.pdf';
  a.click();
  URL.revokeObjectURL(url);
  showToast('PDF downloaded!');
});

// ── Reset ───────────────────────────────────────────────
resetBtn.addEventListener('click', resetImgConverter);

function resetImgConverter() {
  imageFiles.forEach(e => URL.revokeObjectURL(e.objectUrl));
  imageFiles   = [];
  pdfBlob      = null;
  pageSize     = 'auto';
  orientation  = 'portrait';

  optionsEl.style.display    = 'none';
  previewArea.style.display  = 'none';
  progressArea.style.display = 'none';
  resultsArea.style.display  = 'none';
  previewGrid.innerHTML      = '';
  resultInfo.innerHTML       = '';
  setProgress(progressBar, progressLabel, 0, '');
  activatePill(sizePills, 'auto');
  activatePill(orientPills, 'portrait');
}

// ── Init ────────────────────────────────────────────────
initDropZone(dropZoneEl, fileInputEl, addImageFiles);
