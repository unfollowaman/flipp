import { initDropZone, showToast, setProgress } from './drag-drop.js';

const dropZone = document.getElementById('pdf-drop-zone');
const fileInput = document.getElementById('pdf-file-input');
const progressArea = document.getElementById('pdf-progress');
const progressBar = document.getElementById('pdf-progress-bar');
const progressLabel = document.getElementById('pdf-progress-label');
const resultsArea = document.getElementById('pdf-results');
const textOutput = document.getElementById('pdf-text-output');
const ocrNotice = document.getElementById('ocr-notice');
const copyBtn = document.getElementById('pdf-copy-btn');
const downloadBtn = document.getElementById('pdf-download-btn');
const resetBtn = document.getElementById('pdf-reset-btn');

let currentFile = null;
let currentText = '';

initDropZone(dropZone, fileInput, (files) => {
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

resetBtn.addEventListener('click', () => {
  currentFile = null;
  currentText = '';
  textOutput.value = '';
  ocrNotice.style.display = 'none';
  resultsArea.style.display = 'none';
  progressArea.style.display = 'none';
  dropZone.style.display = 'block';
  fileInput.value = '';
});

copyBtn.addEventListener('click', () => {
  if (currentText) {
    navigator.clipboard.writeText(currentText).then(() => {
      showToast('Text copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy text', err);
      showToast('Failed to copy text', 'error');
    });
  }
});

downloadBtn.addEventListener('click', () => {
  if (currentText && currentFile) {
    const blob = new Blob([currentText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name.replace(/\.pdf$/i, '').replace(/[\/\\]/g, '_') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});

async function handleFile(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file', 'error');
    return;
  }
  currentFile = file;
  dropZone.style.display = 'none';
  progressArea.style.display = 'block';
  resultsArea.style.display = 'none';
  ocrNotice.style.display = 'none';
  setProgress(progressBar, progressLabel, 0, 'Analyzing PDF...');

  try {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
    const numPages = pdfDoc.numPages;

    let extractedText = '';
    let hasGarbledChars = false;

    // Stage 1: Try PDF.js text extraction
    setProgress(progressBar, progressLabel, 10, 'Extracting text layer...');

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      extractedText += pageText + '\n\n';
    }

    // Quality check
    const cleanText = extractedText.trim();
    if (cleanText.includes('�')) {
      hasGarbledChars = true;
    }
    const avgCharsPerPage = numPages > 0 ? cleanText.length / numPages : 0;

    if (cleanText.length === 0 || hasGarbledChars || avgCharsPerPage < 50) {
      console.log('Quality check failed, falling back to OCR.');
      await performOCR(pdfDoc, numPages);
    } else {
      console.log('Text extraction successful.');
      currentText = cleanText;
      textOutput.value = currentText;
      progressArea.style.display = 'none';
      resultsArea.style.display = 'flex';
      resultsArea.style.flexDirection = 'column';
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    showToast('Failed to process PDF', 'error');
    progressArea.style.display = 'none';
    dropZone.style.display = 'block';
  }
}

async function performOCR(pdfDoc, numPages) {
  ocrNotice.style.display = 'block';
  let ocrText = '';

  try {
    const worker = await Tesseract.createWorker('eng+hin');

    for (let i = 1; i <= numPages; i++) {
      setProgress(progressBar, progressLabel, ((i - 1) / numPages) * 100, `OCR Processing page ${i} of ${numPages}...`);
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      const imageData = canvas.toDataURL('image/png');

      const { data: { text } } = await worker.recognize(imageData);
      ocrText += text + '\n\n';
    }

    await worker.terminate();

    currentText = ocrText.trim();
    textOutput.value = currentText;
    progressArea.style.display = 'none';
    resultsArea.style.display = 'flex';
    resultsArea.style.flexDirection = 'column';
  } catch (error) {
    console.error('Error during OCR:', error);
    showToast('OCR processing failed', 'error');
    progressArea.style.display = 'none';
    dropZone.style.display = 'block';
  }
}
