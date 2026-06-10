import { initDropZone, showToast, setProgress, setupDragReorder } from '/js/drag-drop.js';

let originalPdfFile = null;
let originalPdfBytes = null;
let pagesOrder = [];
let rearrangedBlob = null;
let pdfDocument = null;

const dropZoneEl = document.getElementById('rearrange-drop-zone');
const fileInputEl = document.getElementById('rearrange-file-input');
const progressArea = document.getElementById('rearrange-progress');
const progressBar = document.getElementById('rearrange-progress-bar');
const progressLabel = document.getElementById('rearrange-progress-label');
const previewArea = document.getElementById('rearrange-preview-area');
const previewGrid = document.getElementById('rearrange-preview-grid');
const countEl = document.getElementById('rearrange-file-count');
const rearrangeBtn = document.getElementById('rearrange-btn');
const resultsArea = document.getElementById('rearrange-results');
const downloadBtn = document.getElementById('rearrange-download-btn');
const resetBtn = document.getElementById('rearrange-reset-btn');

function handleFiles(files) {
  const valid = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (!valid.length) return showToast('Please select a PDF file.', 'error');

  if (originalPdfFile) {
      showToast('You can only reorder one PDF at a time. Resetting...', 'error');
  }

  originalPdfFile = valid[0];
  loadPdfAndRenderThumbnails();
}

async function loadPdfDocument() {
  originalPdfBytes = await originalPdfFile.arrayBuffer();

  // Check if pdfjsLib is loaded globally
  const pdfjs = window['pdfjs-dist/build/pdf'];
  if (!pdfjs) throw new Error('PDF.js not loaded.');

  // Pass a copy so pdf.js doesn't detach the original ArrayBuffer
  pdfDocument = await pdfjs.getDocument({ data: originalPdfBytes.slice(0) }).promise;
  const numPages = pdfDocument.numPages;
  pagesOrder = Array.from({ length: numPages }, (_, i) => i);

  return numPages;
}

function createThumbnailCard(dataUrl, i) {
  const card = document.createElement('div');
  card.className = 'img-thumb-card';
  card.draggable = true;
  card.dataset.idx = i - 1; // 0-based index

  const num = document.createElement('div');
  num.className = 'img-thumb-num';
  num.textContent = i;
  card.appendChild(num);

  const img = document.createElement('img');
  img.src = dataUrl;
  img.loading = 'lazy';
  img.alt = `Page ${i}`;
  card.appendChild(img);

  const lbl = document.createElement('div');
  lbl.className = 'img-thumb-label';
  lbl.textContent = `Page ${i}`;
  card.appendChild(lbl);

  const rmBtn = document.createElement('button');
  rmBtn.className = 'img-thumb-remove';
  rmBtn.textContent = '✕';
  rmBtn.title = 'Remove page';
  rmBtn.onclick = (e) => {
      e.stopPropagation();
      card.remove();
      updatePagesOrder();
  };
  card.appendChild(rmBtn);

  setupDragReorder(card, updatePagesOrder);
  return card;
}

async function renderThumbnails(numPages) {
  previewGrid.innerHTML = '';
  countEl.textContent = `${numPages} page${numPages !== 1 ? 's' : ''}`;

  const fragment = document.createDocumentFragment();

  for (let i = 1; i <= numPages; i++) {
      if (numPages > 20) {
          setProgress(progressBar, progressLabel, Math.round((i / numPages) * 100), `Rendering page ${i} of ${numPages}...`);
          await new Promise(r => setTimeout(r, 0)); // Allow UI update
      }

      const page = await pdfDocument.getPage(i);
      const scale = 0.3;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL();

      const card = createThumbnailCard(dataUrl, i);
      fragment.appendChild(card);
  }

  previewGrid.appendChild(fragment);
}

async function loadPdfAndRenderThumbnails() {
  dropZoneEl.style.display = 'none';
  progressArea.style.display = 'block';
  previewArea.style.display = 'none';
  resultsArea.style.display = 'none';

  setProgress(progressBar, progressLabel, 0, 'Loading PDF...');

  try {
    const numPages = await loadPdfDocument();
    await renderThumbnails(numPages);

    progressArea.style.display = 'none';
    previewArea.style.display = 'block';

  } catch (error) {
    console.error(error);
    showToast('Error loading PDF.', 'error');
    resetRearrange();
  }
}

// ── Drag-to-reorder ─────────────────────────────────────
function updatePagesOrder() {
    const allCards = Array.from(previewGrid.querySelectorAll('.img-thumb-card'));
    pagesOrder = allCards.map(card => parseInt(card.dataset.idx, 10));

    countEl.textContent = `${allCards.length} page${allCards.length !== 1 ? 's' : ''}`;

    // Update displayed page numbers
    allCards.forEach((card, index) => {
        const num = card.querySelector('.img-thumb-num');
        const lbl = card.querySelector('.img-thumb-label');
        num.textContent = index + 1;
        lbl.textContent = `Page ${index + 1}`;
    });
}

// ── Build Output PDF ───────────────────────────────────
rearrangeBtn.addEventListener('click', async () => {
    if (!originalPdfBytes || !pagesOrder.length) return;

    const PDFLib = window.PDFLib;
    if (!PDFLib) return showToast('PDF library not ready yet.', 'error');

    previewArea.style.display = 'none';
    progressArea.style.display = 'block';
    setProgress(progressBar, progressLabel, 0, 'Generating rearranged PDF...');

    try {
        const outPdf = await PDFLib.PDFDocument.create();
        const srcPdf = await PDFLib.PDFDocument.load(originalPdfBytes);

        // Use the new order to copy pages
        const copiedPages = await outPdf.copyPages(srcPdf, pagesOrder);
        copiedPages.forEach(page => outPdf.addPage(page));

        const bytes = await outPdf.save();
        rearrangedBlob = new Blob([bytes], { type: 'application/pdf' });

        progressArea.style.display = 'none';
        resultsArea.style.display = 'block';
        showToast('PDF rearranged successfully!');

    } catch(err) {
        console.error(err);
        showToast('Failed to rearrange PDF.', 'error');
        resetRearrange();
    }
});

// ── Download ───────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!rearrangedBlob) return;

  const originalName = originalPdfFile.name;
  const newName = originalName.replace(/\.pdf$/i, '').replace(/[\/\\]/g, '_') + '-rearranged.pdf';

  const a = document.createElement('a');
  a.href = URL.createObjectURL(rearrangedBlob);
  a.download = newName;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Reset ──────────────────────────────────────────────
resetBtn.addEventListener('click', resetRearrange);

function resetRearrange() {
  originalPdfFile = null;
  originalPdfBytes = null;
  pagesOrder = [];
  rearrangedBlob = null;
  pdfDocument = null;

  dropZoneEl.style.display = 'block';
  previewArea.style.display = 'none';
  resultsArea.style.display = 'none';
  progressArea.style.display = 'none';
  previewGrid.innerHTML = '';
  countEl.textContent = '';
  setProgress(progressBar, progressLabel, 0, '');
}

initDropZone(dropZoneEl, fileInputEl, handleFiles);
