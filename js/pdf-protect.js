import { initDropZone, showToast } from './drag-drop.js';

let pdfFile = null;
let protectedBlob = null;

const dropZoneEl = document.getElementById('protect-drop-zone');
const fileInputEl = document.getElementById('protect-file-input');
const previewArea = document.getElementById('protect-preview-area');
const infoEl = document.getElementById('protect-info');
const protectBtn = document.getElementById('protect-btn');
const resultsArea = document.getElementById('protect-results');
const downloadBtn = document.getElementById('protect-download-btn');
const resetBtn = document.getElementById('protect-reset-btn');
const passwordEl = document.getElementById('protect-password');
const confirmPasswordEl = document.getElementById('protect-password-confirm');

function getPdfJs() { return window['pdfjs-dist/build/pdf']; }
function getJsPdf() { return window.jspdf?.jsPDF; }

function addFiles(files) {
  const first = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (!first) return showToast('Please add a PDF file.', 'error');

  pdfFile = first;
  protectedBlob = null;
  previewArea.style.display = 'block';
  resultsArea.style.display = 'none';
  passwordEl.value = '';
  confirmPasswordEl.value = '';
  infoEl.textContent = `Selected: ${first.name}`;
}

function validatePasswords() {
  const password = passwordEl.value.trim();
  const confirm = confirmPasswordEl.value.trim();

  if (password.length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return null;
  }
  if (password !== confirm) {
    showToast('Passwords do not match.', 'error');
    return null;
  }
  return password;
}

async function rasterizePdfToEncryptedPdf(file, password) {
  const pdfjsLib = getPdfJs();
  const JsPDF = getJsPdf();
  if (!pdfjsLib) throw new Error('PDF.js is not ready');
  if (!JsPDF) throw new Error('jsPDF is not ready');

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  if (pdf.numPages < 1) throw new Error('PDF has no pages');

  let doc = null;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const orientation = viewport.width >= viewport.height ? 'landscape' : 'portrait';

    if (!doc) {
      doc = new JsPDF({
        orientation,
        unit: 'pt',
        format: [viewport.width, viewport.height],
        encryption: {
          userPassword: password,
          ownerPassword: password,
          userPermissions: ['print'],
        },
      });
    } else {
      doc.addPage([viewport.width, viewport.height], orientation);
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    doc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height, undefined, 'FAST');
  }

  if (!doc) throw new Error('Failed to create PDF');
  return doc.output('blob');
}

protectBtn.addEventListener('click', async () => {
  if (!pdfFile) return showToast('Please select a PDF first.', 'error');

  const password = validatePasswords();
  if (!password) return;

  protectBtn.disabled = true;
  protectBtn.textContent = 'Protecting…';

  try {
    protectedBlob = await rasterizePdfToEncryptedPdf(pdfFile, password);
    previewArea.style.display = 'none';
    resultsArea.style.display = 'block';
    showToast('Protected PDF is ready!');
  } catch (err) {
    console.error(err);
    showToast('Failed to protect PDF. Try another file.', 'error');
  } finally {
    protectBtn.disabled = false;
    protectBtn.textContent = 'Protect PDF →';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!protectedBlob || !pdfFile) return;
  const baseName = pdfFile.name.replace(/\.pdf$/i, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(protectedBlob);
  a.download = `${baseName}-protected.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
});

resetBtn.addEventListener('click', () => {
  pdfFile = null;
  protectedBlob = null;
  previewArea.style.display = 'none';
  resultsArea.style.display = 'none';
  infoEl.textContent = '';
  passwordEl.value = '';
  confirmPasswordEl.value = '';
});

if (dropZoneEl && fileInputEl) {
  initDropZone(dropZoneEl, fileInputEl, addFiles);
}
