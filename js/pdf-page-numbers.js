import { initDropZone, showToast } from './drag-drop.js';

const { PDFDocument, StandardFonts, rgb } = window.PDFLib || {};

const dropZoneEl = document.getElementById('number-drop-zone');
const fileInputEl = document.getElementById('number-file-input');
const previewEl = document.getElementById('number-preview-area');
const infoEl = document.getElementById('number-info');
const addBtn = document.getElementById('number-btn');
const resultsEl = document.getElementById('number-results');
const downloadBtn = document.getElementById('number-download-btn');
const resetBtn = document.getElementById('number-reset-btn');
const startPageInput = document.getElementById('number-start-page');
const positionEl = document.getElementById('number-page-position');

let sourceFile = null;
let outputBytes = null;
let position = 'bottom-right';

function onFiles(files) {
  const file = files[0];
  if (!file || (!file.type.includes('pdf') && !/\.pdf$/i.test(file.name))) {
    showToast('Please choose a PDF file.', 'error');
    return;
  }
  sourceFile = file;
  previewEl.style.display = 'block';
  resultsEl.style.display = 'none';
  infoEl.textContent = `Selected: ${file.name}`;
}

positionEl.addEventListener('click', (e) => {
  const card = e.target.closest('.position-card');
  if (!card) return;
  position = card.dataset.value;
  positionEl.querySelectorAll('.position-card').forEach((b) => b.classList.toggle('active', b.dataset.value === position));
});

addBtn.addEventListener('click', async () => {
  if (!sourceFile) return;
  try {
    const bytes = await sourceFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const start = Math.max(1, parseInt(startPageInput.value, 10) || 1);

    for (let i = start - 1; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const text = String(i - (start - 1) + 1);
      const fontSize = Math.max(10, Math.min(14, Math.round(width / 60)));
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const margin = Math.max(18, width * 0.03);

      let x = width - margin - textWidth;
      let y = margin;
      if (position === 'top-right') {
        x = width - margin - textWidth;
        y = height - margin - fontSize;
      } else if (position === 'bottom-center') {
        x = (width - textWidth) / 2;
        y = margin;
      }

      page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.25, 0.25, 0.25) });
    }

    outputBytes = await pdfDoc.save();
    previewEl.style.display = 'none';
    resultsEl.style.display = 'block';
    showToast('✓ Page numbers added!');
  } catch (err) {
    console.error(err);
    showToast('Could not add page numbers. Please try another PDF.', 'error');
  }
});

downloadBtn.addEventListener('click', () => {
  if (!outputBytes) return;
  const blob = new Blob([outputBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sourceFile?.name?.replace(/\.pdf$/i, '') + '-numbered.pdf';
  a.click();
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener('click', () => {
  sourceFile = null;
  outputBytes = null;
  position = 'bottom-right';
  startPageInput.value = '1';
  previewEl.style.display = 'none';
  resultsEl.style.display = 'none';
  infoEl.textContent = '';
  positionEl.querySelectorAll('.position-card').forEach((b) => b.classList.toggle('active', b.dataset.value === 'bottom-right'));
});

initDropZone(dropZoneEl, fileInputEl, onFiles);
