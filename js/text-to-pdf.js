import { showToast } from './drag-drop.js';

const rawTextEl = document.getElementById('text-pdf-raw-input');
const fileInputEl = document.getElementById('text-pdf-file-input');
const useFileBtnEl = document.getElementById('text-pdf-use-file-btn');
const fileInfoEl = document.getElementById('text-pdf-file-info');
const buildBtnEl = document.getElementById('text-pdf-build-btn');
const downloadBtnEl = document.getElementById('text-pdf-download-btn');
const resetBtnEl = document.getElementById('text-pdf-reset-btn');
const previewEl = document.getElementById('text-pdf-preview-area');
const resultsEl = document.getElementById('text-pdf-results');

let selectedTextFile = null;
let outputBlob = null;

function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function getSourceText() {
  return normalizeText(rawTextEl.value || '');
}

async function readTextFile(file) {
  const txt = await file.text();
  return normalizeText(txt);
}

useFileBtnEl.addEventListener('click', () => fileInputEl.click());

fileInputEl.addEventListener('change', () => {
  const file = fileInputEl.files?.[0];
  if (!file) return;

  const looksLikeText = file.type.startsWith('text/') || /\.(txt|md|csv|log|json)$/i.test(file.name);
  if (!looksLikeText) {
    showToast('Please choose a text file (.txt, .md, .csv, .log, .json).', 'error');
    fileInputEl.value = '';
    return;
  }

  selectedTextFile = file;
  fileInfoEl.textContent = `Selected file: ${file.name}`;
  previewEl.style.display = 'block';
  resultsEl.style.display = 'none';
});

buildBtnEl.addEventListener('click', async () => {
  try {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF is unavailable.');

    let content = getSourceText();
    if (!content && selectedTextFile) {
      content = await readTextFile(selectedTextFile);
    }

    if (!content) {
      showToast('Add raw text or upload a text file first.', 'error');
      return;
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 56;
    const marginTop = 64;
    const marginBottom = 72;


    await document.fonts.load('12px Poppins');
    await document.fonts.ready;

    const canvas = document.createElement('canvas');
    const scale = 2; // high-res
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const fontSize = 12;
    const lineHeight = fontSize * 1.5;
    const maxWidth = pageWidth - marginX * 2;

    const paragraphs = content.split('\n');
    let pages = [];

    function drawNewPage() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      ctx.fillStyle = '#000000';
      ctx.font = `${fontSize}px Poppins`;
      ctx.textBaseline = 'top';
    }

    drawNewPage();
    let y = marginTop;

    for (const p of paragraphs) {
      if (!p.trim()) {
        y += lineHeight;
        if (y > pageHeight - marginBottom) {
          pages.push(canvas.toDataURL('image/jpeg', 0.95));
          drawNewPage();
          y = marginTop;
        }
        continue;
      }

      const words = p.split(' ');
      let line = '';

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, marginX, y);
          line = words[i] + ' ';
          y += lineHeight;

          if (y > pageHeight - marginBottom) {
            pages.push(canvas.toDataURL('image/jpeg', 0.95));
            drawNewPage();
            y = marginTop;
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, marginX, y);
      y += lineHeight;

      if (y > pageHeight - marginBottom) {
        pages.push(canvas.toDataURL('image/jpeg', 0.95));
        drawNewPage();
        y = marginTop;
      }
    }

    // Push the last page
    pages.push(canvas.toDataURL('image/jpeg', 0.95));

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage();
      doc.addImage(pages[i], 'JPEG', 0, 0, pageWidth, pageHeight);
    }


    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p += 1) {
      doc.setPage(p);
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(String(p), pageWidth / 2, pageHeight - 32, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
    }

    outputBlob = doc.output('blob');
    previewEl.style.display = 'none';
    resultsEl.style.display = 'block';
    showToast('✓ Text formatted and converted to PDF!');
  } catch (err) {
    console.error(err);
    showToast('Could not build PDF from text.', 'error');
  }
});

downloadBtnEl.addEventListener('click', () => {
  if (!outputBlob) return;
  const url = URL.createObjectURL(outputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'text-document.pdf';
  a.click();
  URL.revokeObjectURL(url);
});

resetBtnEl.addEventListener('click', () => {
  rawTextEl.value = '';
  fileInputEl.value = '';
  selectedTextFile = null;
  outputBlob = null;
  fileInfoEl.textContent = '';
  previewEl.style.display = 'none';
  resultsEl.style.display = 'none';
});

rawTextEl.addEventListener('input', () => {
  if (rawTextEl.value.trim()) {
    previewEl.style.display = 'block';
    resultsEl.style.display = 'none';
  }
});
