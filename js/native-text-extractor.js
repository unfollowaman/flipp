/**
 * Native PDF Text Extraction Engine for Flipp
 *
 * Extracts native text from digitally generated PDFs using PDF.js.
 * Preserves reading order, font information, lines, paragraphs,
 * page numbers, and rotations using transformation matrices and coordinate mapping.
 *
 * Zero OCR. Zero external server calls. Runs 100% in-browser.
 */

const IS_BOLD_REGEX = /bold|black|heavy|medium|semibold/i;
const IS_ITALIC_REGEX = /italic|oblique/i;
const IS_LIST_REGEX = /^([•\-\*▪]|(\d+|[a-zA-Z])[\.\)])\s+/;
const HAS_NON_WHITESPACE_REGEX = /\S/;

/**
 * Normalizes coordinates from PDF user space to top-down viewport space,
 * taking into account page rotation (0, 90, 180, 270) and dimensions.
 */
export function convertPdfPointToViewport(pdfX, pdfY, viewport, pageRotate = 0) {
  if (viewport && typeof viewport.convertToViewportPoint === "function") {
    try {
      return viewport.convertToViewportPoint(pdfX, pdfY);
    } catch (_) {}
  }

  // Fallback calculation for environments without full PDF.js PageViewport
  const rot = ((pageRotate % 360) + 360) % 360;
  const vw = viewport?.width || 595.28;
  const vh = viewport?.height || 841.89;

  if (rot === 90) {
    return [pdfY, pdfX];
  } else if (rot === 180) {
    return [vw - pdfX, pdfY];
  } else if (rot === 270) {
    return [vw - pdfY, vh - pdfX];
  }
  return [pdfX, vh - pdfY];
}

/**
 * Extracts and normalizes text items from PDF.js textContent.
 * Extracts font sizes, transformation matrices, positions, and styling.
 */
export function extractPageTextItems(textContent, viewport, pageRotate = 0) {
  if (!textContent || !Array.isArray(textContent.items)) return [];

  const items = [];

  for (const item of textContent.items) {
    if (!item || typeof item.str !== "string" || !HAS_NON_WHITESPACE_REGEX.test(item.str)) {
      continue;
    }

    const transform = Array.isArray(item.transform) ? item.transform : [12, 0, 0, 12, 0, 0];
    const pdfX = transform[4] || 0;
    const pdfY = transform[5] || 0;

    // Convert PDF baseline coords to top-down viewport coords
    const [vx, vy] = convertPdfPointToViewport(pdfX, pdfY, viewport, pageRotate);

    // Font size: hypotenuse of matrix scale components, or explicit height
    const scaleX = Math.abs(transform[0]) || 12;
    const scaleY = Math.abs(transform[3]) || 12;
    const fontSize = Math.hypot(transform[0], transform[1]) || scaleY || item.height || 12;

    const width = item.width || (item.str.length * fontSize * 0.5);
    const height = item.height || fontSize;
    const topY = vy - height; // top-down coordinate
    const fontName = item.fontName || "";
    const isBold = IS_BOLD_REGEX.test(fontName);
    const isItalic = IS_ITALIC_REGEX.test(fontName);

    items.push({
      str: item.str,
      leftX: vx,
      topY,
      pdfX,
      pdfY,
      width,
      height,
      fontSize,
      fontName,
      isBold,
      isItalic,
      hasEOL: !!item.hasEOL,
      transform,
    });
  }

  return items;
}

/**
 * Orders text items preserving natural reading order.
 * Detects multi-column document layouts to avoid interleaving columns.
 */
export function sortAndDetectReadingOrder(items, pageWidth = 595.28) {
  if (!items || items.length === 0) return [];

  // Sort items top-to-bottom, then left-to-right
  const sorted = [...items].sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);

  const midPoint = pageWidth / 2;
  const margin = pageWidth * 0.08;

  const leftCol = [];
  const rightCol = [];
  const fullWidth = [];

  for (const item of sorted) {
    const itemRight = item.leftX + item.width;
    if (itemRight < midPoint + margin && item.leftX < midPoint - margin) {
      leftCol.push(item);
    } else if (item.leftX > midPoint - margin && itemRight > midPoint + margin) {
      rightCol.push(item);
    } else {
      fullWidth.push(item);
    }
  }

  // If both columns have significant content (>15% each), treat as multi-column
  const isMultiColumn =
    leftCol.length > items.length * 0.15 && rightCol.length > items.length * 0.15;

  if (isMultiColumn) {
    leftCol.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
    rightCol.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
    fullWidth.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);

    const firstColTop = Math.min(leftCol[0]?.topY || Infinity, rightCol[0]?.topY || Infinity);
    const topHeaders = fullWidth.filter((i) => i.topY < firstColTop);
    const bottomFooters = fullWidth.filter((i) => i.topY >= firstColTop);

    return [...topHeaders, ...leftCol, ...rightCol, ...bottomFooters];
  }

  return sorted;
}

/**
 * Groups horizontal text items sharing nearly the same vertical line into single lines.
 * Reconstructs accurate inter-word spacing using positional gaps.
 */
export function groupItemsIntoLines(items) {
  if (!items || items.length === 0) return [];

  const lines = [];

  for (const item of items) {
    let placed = false;

    for (const line of lines) {
      const threshold = Math.max(line.fontSize * 0.45, 3.5);
      if (Math.abs(item.topY - line.topY) <= threshold) {
        line.items.push(item);
        line.sumTopY += item.topY;
        line.topY = line.sumTopY / line.items.length;
        if (item.fontSize > line.fontSize) line.fontSize = item.fontSize;
        if (item.isBold) line.isBold = true;
        if (item.isItalic) line.isItalic = true;
        placed = true;
        break;
      }
    }

    if (!placed) {
      lines.push({
        topY: item.topY,
        sumTopY: item.topY,
        fontSize: item.fontSize,
        isBold: !!item.isBold,
        isItalic: !!item.isItalic,
        items: [item],
      });
    }
  }

  // Sort lines top-to-bottom
  lines.sort((a, b) => a.topY - b.topY);

  // Sort items inside each line horizontally and build line text with correct spacing
  for (const line of lines) {
    line.items.sort((a, b) => a.leftX - b.leftX);

    const parts = [];
    let endsWithSpace = false;

    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i > 0) {
        const prev = line.items[i - 1];
        const gap = cur.leftX - (prev.leftX + prev.width);

        // Gap threshold: if greater than 20% of previous font size, insert space
        if (gap > prev.fontSize * 0.2 && !endsWithSpace && !cur.str.startsWith(" ")) {
          parts.push(" ");
          endsWithSpace = true;
        }
      }

      parts.push(cur.str);
      endsWithSpace = cur.str.endsWith(" ");
    }

    line.text = parts.join("").trim();
    line.leftX = line.items[0]?.leftX || 0;
    line.bottomY = line.topY + line.fontSize;
  }

  return lines.filter((l) => l.text.length > 0);
}

/**
 * Groups lines into logical paragraphs, preserving headings, list items,
 * and vertical paragraph breaks.
 */
export function groupLinesIntoParagraphs(lines, pageWidth = 595.28) {
  if (!lines || lines.length === 0) return [];

  // Calculate median body font size for heading comparison
  const fontSizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

  const paragraphs = [];
  let currentPara = null;

  function finalizeParagraph(para) {
    if (!para || para.lines.length === 0) return;

    const firstLine = para.lines[0];
    const text = para.lines.map((l) => l.text).join(" ").trim();
    const isHeading =
      (firstLine.fontSize >= 14 || (firstLine.isBold && firstLine.fontSize > medianFontSize * 1.15)) &&
      text.length < 120 &&
      para.lines.length <= 2;

    const isList = IS_LIST_REGEX.test(firstLine.text);

    paragraphs.push({
      text,
      isHeading,
      isList,
      fontSize: firstLine.fontSize,
      isBold: firstLine.isBold,
      isItalic: firstLine.isItalic,
      leftX: firstLine.leftX,
      lines: para.lines,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!currentPara) {
      currentPara = {
        lines: [line],
        fontSize: line.fontSize,
        isBold: line.isBold,
        isItalic: line.isItalic,
      };
      continue;
    }

    const prevLine = currentPara.lines[currentPara.lines.length - 1];
    const lineGap = line.topY - prevLine.bottomY;
    const expectedGap = prevLine.fontSize * 0.7;

    const isFontChanged = Math.abs(line.fontSize - prevLine.fontSize) > 2.0;
    const isStyleChanged = line.isBold !== prevLine.isBold;
    const isExcessiveGap = lineGap > expectedGap;
    const isHeading = (line.fontSize >= 14 || line.isBold) && line.text.length < 100;
    const isList = IS_LIST_REGEX.test(line.text);

    if (isExcessiveGap || isFontChanged || isStyleChanged || isHeading || isList) {
      finalizeParagraph(currentPara);
      currentPara = {
        lines: [line],
        fontSize: line.fontSize,
        isBold: line.isBold,
        isItalic: line.isItalic,
      };
    } else {
      currentPara.lines.push(line);
    }
  }

  if (currentPara) {
    finalizeParagraph(currentPara);
  }

  return paragraphs;
}

/**
 * Extracts structured text from a single PDF.js page.
 */
export async function extractSinglePage(page, pageNum) {
  if (!page) {
    return { pageNum, text: "", paragraphs: [], lines: [] };
  }

  const rotation = page.rotate || 0;
  const viewport =
    typeof page.getViewport === "function"
      ? page.getViewport({ scale: 1.0, rotation })
      : { width: 595.28, height: 841.89 };

  let textContent = null;
  if (typeof page.getTextContent === "function") {
    try {
      textContent = await page.getTextContent({ disableCombineTextItems: false });
    } catch (err) {
      console.warn(`Failed to getTextContent on page ${pageNum}:`, err);
    }
  }

  if (!textContent || !textContent.items || textContent.items.length === 0) {
    return {
      pageNum,
      text: "",
      paragraphs: [],
      lines: [],
      width: viewport.width,
      height: viewport.height,
      rotation,
    };
  }

  const rawItems = extractPageTextItems(textContent, viewport, rotation);
  const orderedItems = sortAndDetectReadingOrder(rawItems, viewport.width);
  const lines = groupItemsIntoLines(orderedItems);
  const paragraphs = groupLinesIntoParagraphs(lines, viewport.width);

  const pageText = paragraphs
    .map((p) => (p.isHeading ? `# ${p.text}` : p.text))
    .join("\n\n")
    .trim();

  return {
    pageNum,
    text: pageText,
    paragraphs,
    lines,
    width: viewport.width,
    height: viewport.height,
    rotation,
  };
}

/**
 * Extracts native text across all pages of a loaded PDF.js document.
 * Includes page-by-page progress callback and batches yielding to main thread
 * to avoid freezing the browser on large documents.
 */
export async function extractDocumentText(pdfDoc, onProgress = null) {
  if (!pdfDoc || !pdfDoc.numPages) {
    return { pages: [], fullText: "", isEmpty: true, numPages: 0 };
  }

  const numPages = pdfDoc.numPages;
  const pages = [];
  const batchSize = 10;

  for (let i = 1; i <= numPages; i++) {
    let page = null;
    try {
      page = await pdfDoc.getPage(i);
      const pageData = await extractSinglePage(page, i);
      pages.push(pageData);
    } catch (err) {
      console.warn(`Error extracting page ${i}:`, err);
      pages.push({ pageNum: i, text: "", paragraphs: [], lines: [] });
    } finally {
      if (page && typeof page.cleanup === "function") {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }

    if (onProgress && typeof onProgress === "function") {
      onProgress({
        current: i,
        total: numPages,
        percent: Math.round((i / numPages) * 100),
      });
    }

    // Yield to main thread every batch to maintain browser responsiveness
    if (i % batchSize === 0 && i < numPages) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Format full document text with clear page separation
  const pageSeparators = pages.map((p) => {
    const header = `--- Page ${p.pageNum} ---`;
    return p.text ? `${header}\n\n${p.text}` : `${header}\n\n[Empty Page]`;
  });

  const fullText = pageSeparators.join("\n\n\n");
  const totalLength = pages.reduce((acc, p) => acc + p.text.length, 0);

  return {
    pages,
    fullText,
    isEmpty: totalLength === 0,
    numPages,
  };
}

/**
 * Sanitizes text to characters supported by standard PDF Helvetica font.
 */
export function sanitizeForPdfFont(text) {
  if (!text) return "";
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, " ");
}

/**
 * Generates a clean new PDF containing the edited text using pdf-lib.
 * Handles headings, paragraphs, word wrapping, page breaks, and text overflow.
 * The original PDF document is completely untouched.
 */
export async function generatePdfFromText(content, options = {}) {
  const pdfLib = options.pdfLib || (typeof window !== "undefined" ? window.PDFLib : null);
  if (!pdfLib) {
    throw new Error("PDFLib library is unavailable.");
  }

  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const pdfDoc = await PDFDocument.create();

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = options.pageWidth || 595.28; // A4
  const pageHeight = options.pageHeight || 841.89; // A4
  const marginX = options.marginX || 54;
  const marginTop = options.marginTop || 54;
  const marginBottom = options.marginBottom || 54;
  const printableWidth = pageWidth - marginX * 2;

  // Split into pages if page delimiters exist
  const rawPages = content.split(/(?:^|\n)---+\s*Page\s*\d+\s*---+/i);
  const pageChunks = rawPages.filter((chunk) => chunk.trim().length > 0);

  // If no page delimiters were found, treat entire content as single chunk
  const chunksToRender = pageChunks.length > 0 ? pageChunks : [content];

  for (let cIdx = 0; cIdx < chunksToRender.length; cIdx++) {
    const chunk = chunksToRender[cIdx];
    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    let curY = pageHeight - marginTop;

    const rawParagraphs = chunk.split(/\n\s*\n/);

    for (const rawPara of rawParagraphs) {
      const trimmedPara = rawPara.trim();
      if (!trimmedPara || trimmedPara === "[Empty Page]") continue;

      const isHeading = trimmedPara.startsWith("# ") || trimmedPara.startsWith("## ");
      const displayText = isHeading
        ? trimmedPara.replace(/^#+\s*/, "")
        : trimmedPara;

      const fontSize = isHeading ? 15 : 11;
      const lineHeight = isHeading ? 20 : 15;
      const font = isHeading ? boldFont : regularFont;
      const textColor = isHeading ? rgb(0.1, 0.1, 0.1) : rgb(0.15, 0.15, 0.15);

      // Sanitize for standard Helvetica
      const safeText = sanitizeForPdfFont(displayText);

      // Word-wrap paragraph lines
      const words = safeText.split(/\s+/).filter(Boolean);
      const wrappedLines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        let testWidth = 0;
        try {
          testWidth = font.widthOfTextAtSize(testLine, fontSize);
        } catch (_) {
          testWidth = testLine.length * fontSize * 0.5;
        }

        if (testWidth <= printableWidth || !currentLine) {
          currentLine = testLine;
        } else {
          wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) {
        wrappedLines.push(currentLine);
      }

      // Render lines with overflow check
      for (const line of wrappedLines) {
        if (curY - lineHeight < marginBottom) {
          // Automatic page break on text overflow!
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          curY = pageHeight - marginTop;
        }

        try {
          page.drawText(line, {
            x: marginX,
            y: curY - fontSize,
            size: fontSize,
            font,
            color: textColor,
          });
        } catch (drawErr) {
          console.warn("Character draw fallback:", drawErr);
        }

        curY -= lineHeight;
      }

      // Paragraph spacing
      curY -= isHeading ? 8 : 6;
    }
  }

  // Draw footer page numbers
  const allDocPages = pdfDoc.getPages();
  const totalCount = allDocPages.length;
  for (let i = 0; i < totalCount; i++) {
    const p = allDocPages[i];
    const footerText = `Page ${i + 1} of ${totalCount}`;
    try {
      const footerWidth = regularFont.widthOfTextAtSize(footerText, 9);
      p.drawText(footerText, {
        x: (pageWidth - footerWidth) / 2,
        y: marginBottom / 2,
        size: 9,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    } catch (_) {}
  }

  const pdfBytes = await pdfDoc.save();

  if (typeof Blob !== "undefined") {
    return new Blob([pdfBytes], { type: "application/pdf" });
  }
  return pdfBytes;
}
