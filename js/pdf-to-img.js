// pdf-to-img.js — PDF → PNG conversion using PDF.js

import { initDropZone, showToast, setProgress } from './drag-drop.js';

// ── State ──────────────────────────────────────────────
let pdfDoc        = null;
let totalPages    = 0;
let scale         = 1;
let pageMode      = 'all'; // 'all' | 'range'
let renderedPages = []; // { pageNum, dataUrl }

// ── PDF.js worker setup ─────────────────────────────────
// We load pdf.js as a classic script, access via window
function getPdfjsLib() {
  return window['pdfjs-dist/build/pdf'];
}

async function waitForPdfjs() {
  return new Promise((resolve) => {
    const check = () => {
      const lib = getPdfjsLib();
      if (lib) {
        resolve(lib);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// ── DOM refs ───────────────────────────────────────────
const dropZoneEl      = document.getElementById('pdf-drop-zone');
const fileInputEl     = document.getElementById('pdf-file-input');
const dzContent       = document.getElementById('pdf-dz-content');

const optionsEl       = document.getElementById('pdf-options');
const scaleGroup      = document.getElementById('pdf-scale-pills');
const pagesGroup      = document.getElementById('pdf-pages-pills');
const rangeGroup      = document.getElementById('pdf-range-group');
const rangeInput      = document.getElementById('pdf-range-input');

const previewArea     = document.getElementById('pdf-preview-area');
const pageCountEl     = document.getElementById('pdf-page-count');
const convertBtn      = document.getElementById('pdf-convert-btn');
const previewGrid     = document.getElementById('pdf-preview-grid');

const progressArea    = document.getElementById('pdf-progress');
const progressBar     = document.getElementById('pdf-progress-bar');
const progressLabel   = document.getElementById('pdf-progress-label');

const resultsArea     = document.getElementById('pdf-results');
const resultsGrid     = document.getElementById('pdf-results-grid');
const downloadAllBtn  = document.getElementById('pdf-download-all-btn');
const resetBtn        = document.getElementById('pdf-reset-btn');

// ── Pill helpers ────────────────────────────────────────
function activatePill(group, value) {
  group.querySelectorAll('.opt-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === value);
  });
}

scaleGroup.addEventListener('click', (e) => {
  const pill = e.target.closest('.opt-pill');
  if (!pill) return;
  scale = parseFloat(pill.dataset.value);
  activatePill(scaleGroup, pill.dataset.value);
});

pagesGroup.addEventListener('click', (e) => {
  const pill = e.target.closest('.opt-pill');
  if (!pill) return;
  pageMode = pill.dataset.value;
  activatePill(pagesGroup, pill.dataset.value);
  rangeGroup.style.display = pageMode === 'range' ? 'flex' : 'none';
});

// ── Parse page range string ─────────────────────────────
function parsePageRange(rangeStr, total) {
  const pages = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) pages.add(i);
    } else {
      const n = Number(part);
      if (n >= 1 && n <= total) pages.add(n);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

// ── Render single page to canvas → dataUrl ─────────────
async function renderPageToCanvas(page, renderScale) {
  const viewport = page.getViewport({ scale: renderScale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx      = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

// ── Load PDF file ───────────────────────────────────────
async function loadPDF(file) {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    showToast('Please upload a PDF file.', 'error');
    return;
  }

  try {
    const pdfjsLib = await waitForPdfjs();
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    totalPages = pdfDoc.numPages;

    showPreview(file.name);
  } catch (err) {
    console.error(err);
    showToast('Failed to load PDF. Is it a valid, non-encrypted file?', 'error');
  }
}

// ── Show thumbnails preview ─────────────────────────────
async function showPreview(filename) {
  // Show options + preview area
  optionsEl.style.display    = 'flex';
  previewArea.style.display  = 'block';
  progressArea.style.display = 'none';
  resultsArea.style.display  = 'none';
  previewGrid.innerHTML      = '';

  pageCountEl.textContent = `${totalPages} page${totalPages !== 1 ? 's' : ''} — "${filename}"`;

  // Render first few pages as thumbnails (max 12 for perf)
  const thumbPages = Math.min(totalPages, 12);
  for (let i = 1; i <= thumbPages; i++) {
    const page = await pdfDoc.getPage(i);
    const { canvas } = await renderPageToCanvas(page, 0.3);

    const card = document.createElement('div');
    card.className = 'preview-page-card';
    card.appendChild(canvas);
    const lbl = document.createElement('div');
    lbl.className   = 'preview-page-label';
    lbl.textContent = `Page ${i}`;
    card.appendChild(lbl);
    previewGrid.appendChild(card);
  }
  if (totalPages > 12) {
    const more = document.createElement('div');
    more.className   = 'preview-page-card';
    more.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;font-size:13px;font-weight:700;color:#888;';
    more.textContent = `+${totalPages - 12} more pages`;
    previewGrid.appendChild(more);
  }
}

// ── Convert pages ───────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (!pdfDoc) return;

  let pages;
  if (pageMode === 'range') {
    pages = parsePageRange(rangeInput.value, totalPages);
    if (!pages.length) {
      showToast('No valid pages in range.', 'error');
      return;
    }
  } else {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Show progress
  previewArea.style.display  = 'none';
  optionsEl.style.display    = 'none';
  progressArea.style.display = 'block';
  resultsArea.style.display  = 'none';
  setProgress(progressBar, progressLabel, 0, `Preparing…`);

  renderedPages = [];

  for (let idx = 0; idx < pages.length; idx++) {
    const pageNum = pages[idx];
    setProgress(
      progressBar, progressLabel,
      Math.round(((idx) / pages.length) * 100),
      `Converting page ${pageNum} of ${totalPages}…`
    );

    const page = await pdfDoc.getPage(pageNum);
    const { dataUrl } = await renderPageToCanvas(page, scale);
    renderedPages.push({ pageNum, dataUrl });

    // Yield to UI
    await new Promise(r => setTimeout(r, 0));
  }

  setProgress(progressBar, progressLabel, 100, 'Done!');
  await new Promise(r => setTimeout(r, 400));

  showResults();
});

// ── Show results ────────────────────────────────────────
function showResults() {
  progressArea.style.display = 'none';
  resultsArea.style.display  = 'block';
  resultsGrid.innerHTML      = '';

  for (const { pageNum, dataUrl } of renderedPages) {
    const filename = `page-${String(pageNum).padStart(3, '0')}.png`;

    const card = document.createElement('div');
    card.className = 'result-img-card';

    const img = document.createElement('img');
    img.src = dataUrl;
    img.loading = 'lazy';
    card.appendChild(img);

    const actions = document.createElement('div');
    actions.className = 'result-img-actions';

    const lbl = document.createElement('span');
    lbl.className   = 'result-img-label';
    lbl.textContent = filename;
    actions.appendChild(lbl);

    const dlBtn = document.createElement('button');
    dlBtn.className   = 'result-download-btn';
    dlBtn.textContent = '↓';
    dlBtn.title = `Download ${filename}`;
    dlBtn.addEventListener('click', () => downloadDataUrl(dataUrl, filename));
    actions.appendChild(dlBtn);

    card.appendChild(actions);
    resultsGrid.appendChild(card);
  }

  showToast(`✓ ${renderedPages.length} PNG${renderedPages.length !== 1 ? 's' : ''} ready!`);
}

// ── Download helpers ────────────────────────────────────
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

downloadAllBtn.addEventListener('click', async () => {
  if (!window.JSZip) {
    showToast('ZIP library not loaded yet.', 'error');
    return;
  }
  downloadAllBtn.textContent = 'Zipping…';
  downloadAllBtn.disabled = true;

  const zip = new window.JSZip();
  for (const { pageNum, dataUrl } of renderedPages) {
    const base64 = dataUrl.split(',')[1];
    zip.file(`page-${String(pageNum).padStart(3, '0')}.png`, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'pages.zip';
  a.click();
  URL.revokeObjectURL(url);

  downloadAllBtn.textContent = 'Download All as ZIP 📦';
  downloadAllBtn.disabled = false;
  showToast('ZIP downloaded!');
});

// ── Reset ───────────────────────────────────────────────
resetBtn.addEventListener('click', resetPdfConverter);

function resetPdfConverter() {
  pdfDoc        = null;
  totalPages    = 0;
  renderedPages = [];
  scale         = 1;
  pageMode      = 'all';

  optionsEl.style.display    = 'none';
  previewArea.style.display  = 'none';
  progressArea.style.display = 'none';
  resultsArea.style.display  = 'none';
  previewGrid.innerHTML      = '';
  resultsGrid.innerHTML      = '';
  rangeGroup.style.display   = 'none';
  rangeInput.value           = '';
  setProgress(progressBar, progressLabel, 0, '');
  activatePill(scaleGroup, '1');
  activatePill(pagesGroup, 'all');
}

// ── Init drop zone ──────────────────────────────────────
initDropZone(dropZoneEl, fileInputEl, (files) => {
  const pdf = files.find(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
  if (pdf) loadPDF(pdf);
  else showToast('Please drop a PDF file.', 'error');
});
