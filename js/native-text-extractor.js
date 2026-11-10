/**
 * Native PDF Text Extraction Engine for Flipp
 *
 * Extracts native text from digitally generated PDFs using PDF.js.
 * Preserves reading order, font information, lines, paragraphs,
 * page numbers, and rotations using transformation matrices and coordinate mapping.
 *
 * Supports English, Hindi, Devanagari, Unicode punctuation, mathematical
 * symbols, and currency symbols.
 *
 * Zero OCR. Zero external server calls. Runs 100% in-browser.
 */

const IS_BOLD_REGEX = /bold|black|heavy|medium|semibold/i;
const IS_ITALIC_REGEX = /italic|oblique/i;
const IS_LIST_REGEX = /^([•\-\*▪]|(\d+|[a-zA-Z])[\.\)])\s+/;
const HAS_NON_WHITESPACE_REGEX = /\S/;

const DEVANAGARI_COMBINING_REGEX = /^[\u0901-\u0903\u093A-\u094F\u0951-\u0957\u0962-\u0963]/;
const DEVANAGARI_VIRAMA_END_REGEX = /\u094D$/;
const IS_DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const NO_SPACE_BEFORE_PUNCT_REGEX = /^[,.!?:;\)\]\}”’»।॥%]/;
const NO_SPACE_AFTER_PUNCT_REGEX = /[(\[{“‘«]$/;

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
 * Distinguishes genuine Unicode content from malformed extraction output
 * and records warnings for invalid control characters.
 */
export function extractPageTextItems(textContent, viewport, pageRotate = 0) {
  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return [];
  }

  const items = [];
  let hasMalformedGlyphs = false;
  let malformedCount = 0;

  for (const item of textContent.items) {
    if (!item || typeof item.str !== "string") {
      continue;
    }

    let itemStr = item.str;

    // Detect and handle malformed NUL bytes safely
    if (itemStr.includes("\u0000")) {
      hasMalformedGlyphs = true;
      const nulMatches = itemStr.match(/\u0000/g);
      malformedCount += nulMatches ? nulMatches.length : 1;
      itemStr = itemStr.replace(/\u0000/g, "\uFFFD");
    }

    if (!HAS_NON_WHITESPACE_REGEX.test(itemStr)) {
      continue;
    }

    const transform = Array.isArray(item.transform) ? item.transform : [12, 0, 0, 12, 0, 0];
    const pdfX = transform[4] || 0;
    const pdfY = transform[5] || 0;

    // Convert PDF baseline coords to top-down viewport coords
    const [vx, vy] = convertPdfPointToViewport(pdfX, pdfY, viewport, pageRotate);

    // Font size: vertical matrix scale (hypot of transform[2], transform[3]), or fallback to scaleX/height
    const scaleX = Math.hypot(transform[0], transform[1]) || Math.abs(transform[0]) || 12;
    const scaleY = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 12;
    const fontSize = scaleY || item.height || scaleX || 12;

    const width = item.width || (itemStr.length * fontSize * 0.5);
    const height = item.height || fontSize;
    const topY = vy - height; // top-down coordinate
    const baselineY = vy;
    const fontName = item.fontName || "";
    const isBold = IS_BOLD_REGEX.test(fontName);
    const isItalic = IS_ITALIC_REGEX.test(fontName);

    items.push({
      str: itemStr,
      leftX: vx,
      topY,
      baselineY,
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

  Object.defineProperty(items, "warnings", {
    value: {
      hasMalformedGlyphs,
      malformedCount,
    },
    enumerable: false,
    configurable: true,
  });

  return items;
}

/**
 * Orders text items preserving natural reading order.
 * Uses Banded Reading Order: partitions the page into vertical bands delimited
 * by full-width or spanning items (titles, headers, banners), then clusters items
 * horizontally into columns (1, 2, or 3 columns) within each band, avoiding interleaving.
 */
export function sortAndDetectReadingOrder(items, pageWidth = 595.28) {
  if (!items || items.length === 0) return [];

  // Sort items top-to-bottom, then left-to-right
  const sorted = [...items].sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);

  // Helper to identify spanning items (headers, footers, full-width section breaks)
  const isSpanningItem = (item) => {
    const w = item.width || 0;
    if (w >= pageWidth * 0.55) return true;
    if (item.fontSize >= 14 && w >= pageWidth * 0.40) return true;
    return false;
  };

  // Partition into vertical bands
  const bands = [];
  let currentBand = [];

  for (const item of sorted) {
    if (isSpanningItem(item)) {
      if (currentBand.length > 0) {
        bands.push({ type: "content", items: currentBand });
        currentBand = [];
      }
      bands.push({ type: "spanning", items: [item] });
    } else {
      currentBand.push(item);
    }
  }
  if (currentBand.length > 0) {
    bands.push({ type: "content", items: currentBand });
  }

  const result = [];

  for (const band of bands) {
    if (band.type === "spanning" || band.items.length <= 1) {
      result.push(...band.items);
      continue;
    }

    const bandItems = band.items;

    // Detect column clusters using horizontal intervals
    const intervals = bandItems
      .map((it) => ({
        left: it.leftX,
        right: it.leftX + (it.width || 1),
      }))
      .sort((a, b) => a.left - b.left);

    // Merge overlapping/near intervals
    const merged = [];
    const gutterThreshold = Math.max(pageWidth * 0.04, 20);

    for (const inv of intervals) {
      if (merged.length === 0) {
        merged.push({ left: inv.left, right: inv.right });
      } else {
        const prevInv = merged[merged.length - 1];
        if (inv.left <= prevInv.right + gutterThreshold) {
          prevInv.right = Math.max(prevInv.right, inv.right);
        } else {
          merged.push({ left: inv.left, right: inv.right });
        }
      }
    }

    // If 2 or more distinct column intervals are found
    if (merged.length >= 2) {
      const columns = merged.map((col) => ({
        left: col.left,
        right: col.right,
        items: [],
      }));

      for (const it of bandItems) {
        const itMid = it.leftX + (it.width || 1) / 2;
        let bestCol = columns[0];
        let bestDist = Infinity;
        for (const col of columns) {
          if (itMid >= col.left && itMid <= col.right) {
            bestCol = col;
            bestDist = 0;
            break;
          }
          const dist = Math.min(Math.abs(itMid - col.left), Math.abs(itMid - col.right));
          if (dist < bestDist) {
            bestDist = dist;
            bestCol = col;
          }
        }
        bestCol.items.push(it);
      }

      const significantCols = columns.filter((col) => col.items.length > 0);
      const hasMultiCols =
        significantCols.length >= 2 &&
        significantCols.filter((col) => col.items.length >= Math.max(2, bandItems.length * 0.1)).length >= 2;

      if (hasMultiCols) {
        // Sort each column top-to-bottom, left-to-right
        for (const col of significantCols) {
          col.items.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
          result.push(...col.items);
        }
        continue;
      }
    }

    // Default single column order for band
    bandItems.sort((a, b) => a.topY - b.topY || a.leftX - b.leftX);
    result.push(...bandItems);
  }

  return result;
}

/**
 * Groups horizontal text items sharing nearly the same vertical line into single lines.
 * Reconstructs accurate inter-word spacing using positional gaps while preventing
 * artificial space injection inside words, Devanagari matras/viramas, and punctuation.
 */
export function groupItemsIntoLines(items) {
  if (!items || items.length === 0) return [];

  const lines = [];

  for (const item of items) {
    let placed = false;

    for (const line of lines) {
      const threshold = Math.max(line.fontSize * 0.45, 3.5);
      const lineY = line.baselineY != null ? line.baselineY : line.topY;
      const itemY = item.baselineY != null ? item.baselineY : item.topY;

      if (Math.abs(itemY - lineY) <= threshold) {
        line.items.push(item);
        line.sumTopY += item.topY;
        line.topY = line.sumTopY / line.items.length;
        if (item.baselineY != null) {
          line.sumBaselineY = (line.sumBaselineY || 0) + item.baselineY;
          line.baselineY = line.sumBaselineY / line.items.length;
        }
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
        baselineY: item.baselineY,
        sumBaselineY: item.baselineY,
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

        const prevStr = prev.str || "";
        const curStr = cur.str || "";

        const isDevanagari = IS_DEVANAGARI_REGEX.test(prevStr) || IS_DEVANAGARI_REGEX.test(curStr);
        const isCombining = DEVANAGARI_COMBINING_REGEX.test(curStr);
        const isHalantJoin = DEVANAGARI_VIRAMA_END_REGEX.test(prevStr);
        const isClosingPunct = NO_SPACE_BEFORE_PUNCT_REGEX.test(curStr);
        const isOpeningPunct = NO_SPACE_AFTER_PUNCT_REGEX.test(prevStr);

        const spacingThreshold = isDevanagari
          ? Math.max(prev.fontSize * 0.35, 3.8)
          : Math.max(prev.fontSize * 0.22, 2.4);

        const shouldInsertSpace =
          gap > spacingThreshold &&
          !endsWithSpace &&
          !curStr.startsWith(" ") &&
          !isCombining &&
          !isHalantJoin &&
          !isClosingPunct &&
          !isOpeningPunct;

        if (shouldInsertSpace) {
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
 * and vertical paragraph breaks without fragmenting paragraphs on inline bold text.
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
      !text.endsWith(".") &&
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
    const expectedGap = prevLine.fontSize * 0.75;

    const isFontChanged = Math.abs(line.fontSize - prevLine.fontSize) > 2.5;
    const isExcessiveGap = lineGap > expectedGap;
    const isHeading =
      (line.fontSize >= 14 || (line.isBold && line.fontSize > medianFontSize * 1.15)) &&
      line.text.length < 100 &&
      !line.text.endsWith(".");
    const isList = IS_LIST_REGEX.test(line.text);

    if (isExcessiveGap || isFontChanged || isHeading || isList) {
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
 * Reconstructs readable plain text without markdown (#) pollution.
 */
export async function extractSinglePage(page, pageNum) {
  if (!page) {
    return {
      pageNum,
      text: "",
      paragraphs: [],
      lines: [],
      warnings: { hasMalformedGlyphs: false, malformedCount: 0 },
    };
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
      warnings: { hasMalformedGlyphs: false, malformedCount: 0 },
    };
  }

  const rawItems = extractPageTextItems(textContent, viewport, rotation);
  const orderedItems = sortAndDetectReadingOrder(rawItems, viewport.width);
  const lines = groupItemsIntoLines(orderedItems);
  const paragraphs = groupLinesIntoParagraphs(lines, viewport.width);

  // Clean plain text without markdown prefix pollution
  const pageText = paragraphs
    .map((p) => p.text)
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
    warnings: rawItems.warnings || { hasMalformedGlyphs: false, malformedCount: 0 },
  };
}

/**
 * Extracts native text across all pages of a loaded PDF.js document.
 * Includes page-by-page progress callback and batches yielding to main thread
 * to avoid freezing the browser on large documents.
 */
export async function extractDocumentText(pdfDoc, onProgress = null) {
  if (!pdfDoc || !pdfDoc.numPages) {
    return {
      pages: [],
      fullText: "",
      isEmpty: true,
      numPages: 0,
      warnings: { hasMalformedGlyphs: false, malformedCount: 0 },
    };
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
      pages.push({
        pageNum: i,
        text: "",
        paragraphs: [],
        lines: [],
        warnings: { hasMalformedGlyphs: false, malformedCount: 0 },
      });
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
  const hasMalformed = pages.some((p) => p.warnings?.hasMalformedGlyphs);
  const totalMalformed = pages.reduce((acc, p) => acc + (p.warnings?.malformedCount || 0), 0);

  return {
    pages,
    fullText,
    isEmpty: totalLength === 0,
    numPages,
    warnings: {
      hasMalformedGlyphs: hasMalformed,
      malformedCount: totalMalformed,
    },
  };
}

/**
 * Sanitizes and normalizes text for PDF rendering.
 * Normalizes newlines and tabs, removes unprintable C0 control characters (preserving newlines).
 *
 * If strictWinAnsi is enabled (only when falling back to standard Helvetica without fontkit),
 * smart typography is gracefully mapped to ASCII/WinAnsi equivalents rather than deleted.
 * When strictWinAnsi is false (default, for Unicode font rendering), all valid Unicode
 * characters including Hindi, mathematical symbols, and currency symbols are preserved.
 */
export function sanitizeForPdfFont(text, options = {}) {
  if (!text) return "";
  const strictWinAnsi = options.strictWinAnsi === true;

  let cleaned = String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "");

  if (strictWinAnsi) {
    cleaned = cleaned
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[\u2022\u25AA]/g, "*")
      .replace(/\u20AC/g, "EUR")
      .replace(/\u20B9/g, "INR")
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, " ");
  }

  return cleaned;
}

/**
 * Generates a clean new PDF containing the edited text using pdf-lib.
 * Handles headings, paragraphs, word wrapping, page breaks, and text overflow.
 * When fontkit and custom fontBytes (e.g. Poppins-Regular) are provided,
 * embeds Unicode font with font subsetting, fully supporting Hindi and extended Unicode.
 * The original PDF document is completely untouched.
 */
export async function generatePdfFromText(content, options = {}) {
  const pdfLib = options.pdfLib || (typeof window !== "undefined" ? window.PDFLib : null);
  if (!pdfLib) {
    throw new Error("PDFLib library is unavailable.");
  }

  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const pdfDoc = await PDFDocument.create();

  // Check for fontkit and custom font (e.g. Poppins-Regular for Unicode & Hindi support)
  const fontkit = options.fontkit || (typeof window !== "undefined" ? window.fontkit : null);
  let regularFont = null;
  let boldFont = null;
  let hasUnicodeFont = false;

  if (fontkit && options.fontBytes) {
    try {
      pdfDoc.registerFontkit(fontkit);
      const customFont = await pdfDoc.embedFont(options.fontBytes, { subset: true });
      regularFont = customFont;
      boldFont = customFont;
      hasUnicodeFont = true;
    } catch (fontErr) {
      console.warn("Failed to embed custom fontkit font, falling back to standard fonts:", fontErr);
    }
  }

  if (!regularFont) {
    regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  const pageWidth = options.pageWidth || 595.28; // A4
  const pageHeight = options.pageHeight || 841.89; // A4
  const marginX = options.marginX || 54;
  const marginTop = options.marginTop || 54;
  const marginBottom = options.marginBottom || 54;
  const printableWidth = pageWidth - marginX * 2;

  // Split into pages if page delimiters exist
  const rawPages = content.split(/(?:^|\n)---+\s*Page\s*\d+\s*---+/i);
  const pageChunks = rawPages.filter((chunk) => chunk.trim().length > 0);
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
      const displayText = isHeading ? trimmedPara.replace(/^#+\s*/, "") : trimmedPara;

      const fontSize = isHeading ? 15 : 11;
      const lineHeight = isHeading ? 20 : 15;
      const font = isHeading ? boldFont : regularFont;
      const textColor = isHeading ? rgb(0.1, 0.1, 0.1) : rgb(0.15, 0.15, 0.15);

      // Sanitize text: if standard Helvetica, use strictWinAnsi mapping; if Unicode font, preserve Unicode
      const safeText = sanitizeForPdfFont(displayText, { strictWinAnsi: !hasUnicodeFont });

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
          if (!hasUnicodeFont) {
            try {
              const fallbackLine = sanitizeForPdfFont(line, { strictWinAnsi: true });
              page.drawText(fallbackLine, {
                x: marginX,
                y: curY - fontSize,
                size: fontSize,
                font,
                color: textColor,
              });
            } catch (_) {}
          } else {
            console.warn("Character draw fallback:", drawErr);
          }
        }

        curY -= lineHeight;
      }

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
