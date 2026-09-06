import { initDropZone, showToast, setProgress, triggerDownload } from "./drag-drop.js";

// Global exports / helpers for core layout reconstruction and conversion logic
export function getPdfJsLib() {
  return window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
}

export function getDocxLib() {
  return window.docx;
}

export function sanitizeFilename(filename) {
  if (!filename) return "document.docx";
  const base = filename.replace(/\.pdf$/i, "").replace(/[\/\\]/g, "_");
  return `${base}.docx`;
}

// Coordinate transformation: convert PDF Y (from bottom) to top-down Y
export function extractPageTextItems(textContent, viewportHeight) {
  if (!textContent || !textContent.items) return [];

  const items = [];
  for (const item of textContent.items) {
    if (!item.str || item.str.trim().length === 0) continue;
    const transform = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
    const leftX = transform[4];
    const pdfY = transform[5];
    const topY = viewportHeight - pdfY;
    const fontSize = Math.abs(transform[3]) || Math.abs(transform[0]) || item.height || 12;
    const width = item.width || (item.str.length * fontSize * 0.5);
    const height = item.height || fontSize;
    const fontName = item.fontName || "";
    const isBold = /bold|black|heavy|medium/i.test(fontName);
    const isItalic = /italic|oblique/i.test(fontName);

    items.push({
      str: item.str,
      leftX,
      topY,
      width,
      height,
      fontSize,
      fontName,
      isBold,
      isItalic
    });
  }
  return items;
}

// Detect multi-column structures and arrange reading order
export function sortAndDetectColumns(items, pageWidth) {
  if (!items || items.length === 0) return [];

  // Sort items top-to-bottom, then left-to-right
  const sortedByY = [...items].sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);

  // Check if items fall into 2 distinct horizontal columns
  const midPoint = pageWidth / 2;
  const margin = pageWidth * 0.08;

  let leftColItems = [];
  let rightColItems = [];
  let fullWidthItems = [];

  for (const item of sortedByY) {
    const itemRight = item.leftX + item.width;
    if (itemRight < midPoint + margin && item.leftX < midPoint - margin) {
      leftColItems.push(item);
    } else if (item.leftX > midPoint - margin && itemRight > midPoint + margin) {
      rightColItems.push(item);
    } else {
      fullWidthItems.push(item);
    }
  }

  // If both columns have significant content (e.g., > 15% of total items each), treat as multi-column
  const isMultiColumn = leftColItems.length > items.length * 0.15 && rightColItems.length > items.length * 0.15;

  if (isMultiColumn) {
    // Return left column items first (sorted top-to-bottom), then right column items (sorted top-to-bottom)
    leftColItems.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
    rightColItems.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
    fullWidthItems.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);

    // Merge in natural reading order
    return [...fullWidthItems.filter(i => i.topY < Math.min(leftColItems[0]?.topY || Infinity, rightColItems[0]?.topY || Infinity)),
            ...leftColItems,
            ...rightColItems,
            ...fullWidthItems.filter(i => i.topY >= Math.min(leftColItems[0]?.topY || Infinity, rightColItems[0]?.topY || Infinity))];
  }

  return sortedByY;
}

// Group horizontal text items sharing nearly same vertical Y into lines
export function groupItemsIntoLines(items) {
  if (!items || items.length === 0) return [];

  const lines = [];
  for (const item of items) {
    let placed = false;
    for (const line of lines) {
      // If item's topY is within vertical threshold of current line
      const avgY = line.topY;
      const threshold = Math.max(line.fontSize * 0.4, 3);
      if (Math.abs(item.topY - avgY) <= threshold) {
        line.items.push(item);
        // Recalculate line properties
        line.items.sort((a, b) => a.leftX - b.leftX);
        line.topY = line.items.reduce((sum, i) => sum + i.topY, 0) / line.items.length;
        line.fontSize = Math.max(...line.items.map(i => i.fontSize));
        line.isBold = line.items.some(i => i.isBold);
        line.isItalic = line.items.some(i => i.isItalic);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({
        topY: item.topY,
        fontSize: item.fontSize,
        isBold: item.isBold,
        isItalic: item.isItalic,
        items: [item]
      });
    }
  }

  // Construct combined line text with proper spacing
  for (const line of lines) {
    let text = "";
    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i > 0) {
        const prev = line.items[i - 1];
        const gap = cur.leftX - (prev.leftX + prev.width);
        if (gap > prev.fontSize * 0.2 && !text.endsWith(" ") && !cur.str.startsWith(" ")) {
          text += " ";
        }
      }
      text += cur.str;
    }
    line.text = text.trim();
    line.leftX = line.items[0]?.leftX || 0;
  }

  return lines.filter(l => l.text.length > 0);
}

// Group lines into logical paragraphs based on line spacing, font size, and alignment
export function groupLinesIntoParagraphs(lines, pageWidth) {
  if (!lines || lines.length === 0) return [];

  const paragraphs = [];
  let currentPara = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!currentPara) {
      currentPara = {
        lines: [line],
        fontSize: line.fontSize,
        isBold: line.isBold,
        isItalic: line.isItalic,
        leftX: line.leftX
      };
      continue;
    }

    const prevLine = currentPara.lines[currentPara.lines.length - 1];
    const lineGap = line.topY - prevLine.topY;
    const expectedGap = prevLine.fontSize * 1.5;

    // Check if line starts new paragraph
    const isFontChanged = Math.abs(line.fontSize - prevLine.fontSize) > 1.5;
    const isStyleChanged = line.isBold !== prevLine.isBold;
    const isExcessiveGap = lineGap > expectedGap;
    const isHeading = line.fontSize > 14 && line.text.length < 80;

    if (isExcessiveGap || isFontChanged || isStyleChanged || isHeading) {
      paragraphs.push(formatParagraphObject(currentPara, pageWidth));
      currentPara = {
        lines: [line],
        fontSize: line.fontSize,
        isBold: line.isBold,
        isItalic: line.isItalic,
        leftX: line.leftX
      };
    } else {
      currentPara.lines.push(line);
    }
  }

  if (currentPara) {
    paragraphs.push(formatParagraphObject(currentPara, pageWidth));
  }

  return paragraphs;
}

function formatParagraphObject(para, pageWidth) {
  const fullText = para.lines.map(l => l.text).join(" ").replace(/\s+/g, " ");

  // Heading detection heuristics
  let isHeading = false;
  let headingLevel = null;
  if (para.fontSize >= 18 && fullText.length < 100) {
    isHeading = true;
    headingLevel = "HEADING_1";
  } else if (para.fontSize >= 14 && (para.isBold || fullText.length < 80)) {
    isHeading = true;
    headingLevel = "HEADING_2";
  }

  // Alignment detection
  let alignment = "LEFT";
  const avgLeft = para.leftX;
  if (Math.abs(avgLeft - (pageWidth / 2)) < 50 && fullText.length < 80) {
    alignment = "CENTER";
  }

  // List detection
  let isList = false;
  if (/^([•\-\*▪]|(\d+|[a-zA-Z])[\.\)])\s+/.test(fullText)) {
    isList = true;
  }

  return {
    text: fullText,
    fontSize: para.fontSize,
    isBold: para.isBold,
    isItalic: para.isItalic,
    isHeading,
    headingLevel,
    alignment,
    isList
  };
}

// Basic Table Detection heuristic
export function detectTableStructure(lines) {
  if (!lines || lines.length < 2) return null;

  // Check if consecutive lines contain multiple items with aligned X positions
  const rows = [];
  for (const line of lines) {
    if (line.items.length >= 2) {
      rows.push(line.items.map(item => item.str.trim()));
    }
  }

  if (rows.length >= 2) {
    const colCount = Math.min(...rows.map(r => r.length));
    if (colCount >= 2) {
      return rows.map(r => r.slice(0, colCount));
    }
  }

  return null;
}

// Convert extracted paragraph data into docx JS elements
export function createDocxElementsFromPageData(pageData, docxLib) {
  if (!docxLib) return [];

  const elements = [];
  const { paragraphs, pageNum, totalPages } = pageData;

  if (pageNum > 1) {
    elements.push(new docxLib.Paragraph({ children: [new docxLib.PageBreak()] }));
  }

  for (const p of paragraphs) {
    if (!p.text) continue;

    if (p.isHeading) {
      const headingType = p.headingLevel === "HEADING_1" ? docxLib.HeadingLevel.HEADING_1 : docxLib.HeadingLevel.HEADING_2;
      elements.push(
        new docxLib.Paragraph({
          text: p.text,
          heading: headingType,
          spacing: { before: 240, after: 120 }
        })
      );
    } else {
      let align = docxLib.AlignmentType.LEFT;
      if (p.alignment === "CENTER") align = docxLib.AlignmentType.CENTER;
      if (p.alignment === "RIGHT") align = docxLib.AlignmentType.RIGHT;

      elements.push(
        new docxLib.Paragraph({
          children: [
            new docxLib.TextRun({
              text: p.text,
              size: Math.round((p.fontSize || 12) * 2), // Half-points in docx
              bold: !!p.isBold,
              italics: !!p.isItalic
            })
          ],
          alignment: align,
          spacing: { after: 120, line: 276 }
        })
      );
    }
  }

  return elements;
}

// Primary DOCX generation entrypoint
export async function generateDocxBlobFromPdfData(pagesData, docxLib) {
  if (!docxLib) throw new Error("docx library is not loaded");

  const allChildren = [];

  for (const pageData of pagesData) {
    if (pageData.imageBuffer) {
      // Rendered scanned page or image fallback
      if (pageData.pageNum > 1) {
        allChildren.push(new docxLib.Paragraph({ children: [new docxLib.PageBreak()] }));
      }
      allChildren.push(
        new docxLib.Paragraph({
          children: [
            new docxLib.ImageRun({
              data: pageData.imageBuffer,
              transformation: {
                width: pageData.width || 595,
                height: pageData.height || 842
              }
            })
          ],
          alignment: docxLib.AlignmentType.CENTER,
          spacing: { after: 120 }
        })
      );
    } else {
      const pageChildren = createDocxElementsFromPageData(pageData, docxLib);
      allChildren.push(...pageChildren);
    }
  }

  const doc = new docxLib.Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: allChildren.length > 0 ? allChildren : [new docxLib.Paragraph({ text: "" })]
      }
    ]
  });

  return await docxLib.Packer.toBlob(doc);
}

// UI Event listeners setup function
export function initPdfToWordUI() {
  const dropZone = document.getElementById("pdf-drop-zone");
  const fileInput = document.getElementById("pdf-file-input");
  const progressArea = document.getElementById("pdf-progress");
  const progressBar = document.getElementById("pdf-progress-bar");
  const progressLabel = document.getElementById("pdf-progress-label");
  const optionsArea = document.getElementById("pdf-options");
  const resultsArea = document.getElementById("pdf-results");
  const downloadBtn = document.getElementById("pdf-download-btn");
  const resetBtn = document.getElementById("pdf-reset-btn");
  const modeSelect = document.getElementById("conversion-mode-select");
  const languageGroup = document.getElementById("ocr-language-group");
  const languageSelect = document.getElementById("ocr-language-select");

  if (!dropZone || !fileInput) return;

  let currentFile = null;
  let generatedBlob = null;
  let ocrWorkerPromise = null;

  initDropZone(dropZone, fileInput, (files) => {
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      if (languageGroup) {
        languageGroup.style.display = modeSelect.value === "ocr" ? "block" : "none";
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentFile = null;
      generatedBlob = null;
      if (fileInput) fileInput.value = "";
      if (resultsArea) resultsArea.classList.remove("is-visible");
      if (progressArea) progressArea.style.display = "none";
      if (optionsArea) optionsArea.style.display = "none";
      if (dropZone) dropZone.style.display = "block";
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (generatedBlob && currentFile) {
        const outName = sanitizeFilename(currentFile.name);
        const url = URL.createObjectURL(generatedBlob);
        triggerDownload(url, outName, true);
      }
    });
  }

  async function handleFileSelected(file) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please upload a PDF file", "error");
      return;
    }

    currentFile = file;
    dropZone.style.display = "none";
    progressArea.style.display = "block";
    if (optionsArea) optionsArea.style.display = "block";
    setProgress(progressBar, progressLabel, 0, "Analyzing PDF...");

    const pdfjsLib = getPdfJsLib();
    const docxLib = getDocxLib();

    if (!pdfjsLib) {
      showToast("PDF processor is initializing. Please try again.", "error");
      resetToUpload();
      return;
    }

    if (!docxLib) {
      showToast("Word document engine is initializing. Please try again.", "error");
      resetToUpload();
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      let pdfDoc;

      try {
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, ignoreEncryption: true }).promise;
      } catch (err) {
        if (err.name === "PasswordException" || err.message?.includes("password")) {
          showPasswordError();
          return;
        }
        throw err;
      }

      const numPages = pdfDoc.numPages;
      const pagesData = [];
      const userMode = modeSelect ? modeSelect.value : "auto";
      const ocrLang = languageSelect ? languageSelect.value : "eng+hin";

      const getOcrWorker = () => {
        if (!ocrWorkerPromise && window.Tesseract) {
          ocrWorkerPromise = window.Tesseract.createWorker(ocrLang);
        }
        return ocrWorkerPromise;
      };

      for (let i = 1; i <= numPages; i++) {
        setProgress(
          progressBar,
          progressLabel,
          (i / numPages) * 70,
          `Analyzing & extracting page ${i} of ${numPages}...`
        );

        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        const rawItems = extractPageTextItems(textContent, viewport.height);

        const totalChars = rawItems.reduce((acc, item) => acc + item.str.length, 0);
        const isScanned = totalChars < 10;

        let forceOcr = userMode === "ocr" || (userMode === "auto" && isScanned);

        if (forceOcr && window.Tesseract) {
          try {
            setProgress(
              progressBar,
              progressLabel,
              (i / numPages) * 70,
              `Running OCR on page ${i} of ${numPages}...`
            );
            const worker = await getOcrWorker();
            const renderViewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = renderViewport.width;
            canvas.height = renderViewport.height;

            await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
            const imageData = canvas.toDataURL("image/png");

            const { data } = await worker.recognize(imageData);

            // Clean up canvas
            canvas.width = 0;
            canvas.height = 0;

            const ocrLines = (data.lines || []).map(line => ({
              text: line.text.trim(),
              fontSize: 12,
              isBold: false,
              isItalic: false,
              isHeading: false,
              alignment: "LEFT"
            })).filter(l => l.text.length > 0);

            pagesData.push({
              pageNum: i,
              totalPages: numPages,
              paragraphs: ocrLines
            });
            continue;
          } catch (ocrErr) {
            console.warn(`OCR failed for page ${i}, falling back to text parsing`, ocrErr);
          }
        }

        // Standard PDF parsing path
        const orderedItems = sortAndDetectColumns(rawItems, viewport.width);
        const lines = groupItemsIntoLines(orderedItems);
        const paragraphs = groupLinesIntoParagraphs(lines, viewport.width);

        pagesData.push({
          pageNum: i,
          totalPages: numPages,
          paragraphs
        });
      }

      if (ocrWorkerPromise) {
        try {
          const worker = await ocrWorkerPromise;
          await worker.terminate();
        } catch (e) {
          // ignore cleanup errors
        }
      }

      setProgress(progressBar, progressLabel, 85, "Building Word document (.docx)...");

      // Yield thread briefly for DOM paint
      await new Promise(r => setTimeout(r, 50));

      generatedBlob = await generateDocxBlobFromPdfData(pagesData, docxLib);

      setProgress(progressBar, progressLabel, 100, "Conversion complete!");
      setTimeout(() => {
        progressArea.style.display = "none";
        if (optionsArea) optionsArea.style.display = "none";
        resultsArea.classList.add("is-visible");
      }, 500);

    } catch (err) {
      console.error("Error converting PDF to Word:", err);
      showToast("Couldn't convert this PDF. The file may be damaged or unsupported.", "error");
      resetToUpload();
    }
  }

  function showPasswordError() {
    progressArea.style.display = "none";
    if (optionsArea) optionsArea.style.display = "none";
    dropZone.style.display = "block";
    showToast("This PDF is password protected. Unlock it first, then convert it to Word.", "error");
  }

  function resetToUpload() {
    progressArea.style.display = "none";
    if (optionsArea) optionsArea.style.display = "none";
    dropZone.style.display = "block";
    fileInput.value = "";
  }
}

// Auto-initialize UI on DOMContentLoaded if running in browser environment
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPdfToWordUI);
  } else {
    initPdfToWordUI();
  }
}
